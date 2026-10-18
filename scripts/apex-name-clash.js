#!/usr/bin/env node
/**
 * Apex name-clash check. Apex ignores case in names, and a variable beats a class or a field
 * further out. So inside the scope of a field `campLabels`, `CampLabels.forCamp(...)` means the
 * field, not the class, and the class fails to compile; only the org's compiler says so (#46,
 * #48). Jest, Prettier and Code Analyzer don't compile Apex.
 *
 * A hit: a name used with a dot (`Name.member`) where a local, parameter or field in scope has
 * that name under a different spelling. The use meant something else (a class, or a static
 * further out) and gets the variable instead:
 * - field `campLabels` and `CampLabels.forCamp(...)` in the same class (#46);
 * - local `targets` and the class's static `TARGETS.keySet()` later in the method (#48);
 * - local `scheduleUses` and `ScheduleUses.Count` later in its block.
 * Not hits, because they compile: a local's own initializer (`String inUse = InUse.reason(id);`,
 * the local's scope starts after it), a class sharing a name with a static of the same class
 * (`class ItemFields` and `static ... itemFields`), uses without a dot (`new Targets()`), the
 * same spelling everywhere, and methods. It reads Apex with regular expressions, not a parser:
 * a false alarm is a bug in this script.
 *
 * Opt-out, on the variable's declaration line, with a reason: `// apex-name-clash-ok: <why>`.
 *
 * Usage: node scripts/apex-name-clash.js   (exit 1, listing each one, if any is found)
 */
const fs = require("node:fs");
const path = require("node:path");
const { lexApex } = require("./namespace-safety");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = "force-app";
const OPT_OUT = /apex-name-clash-ok:\s*\S/;

// Words that can stand where a declaration's type would ("return x;", "insert rows;").
const NOT_TYPES = new Set(
  (
    "return new throw else case when instanceof class interface enum extends implements " +
    "insert update upsert delete undelete merge private public protected global static final " +
    "override virtual abstract transient webservice testmethod"
  ).split(" ")
);
const IDENT = "[A-Za-z_]\\w*";
const DECL = new RegExp(
  `\\b(${IDENT}(?:\\s*\\.\\s*${IDENT})*(?:\\s*<[\\w\\s.,<>\\[\\]]*?>)?(?:\\s*\\[\\s*\\])?)` +
    `\\s+(${IDENT})\\s*(?=[=;,):{])`,
  "g"
);
const TYPE_DECL = new RegExp(`\\b(class|interface|enum)\\s+(${IDENT})`, "gi");

/** Apex with comments, strings, SOQL/SOSL and `as user` blanked; offsets and lines kept. */
function codeOf(source, isTrigger) {
  let code = lexApex(source).code;
  code = code.replace(/\[\s*(select|find)\b[^\]]*\]/gi, blank);
  code = code.replace(/\bas\s+(user|system)\b/gi, blank);
  // A trigger's header (`trigger X on Week__c (before insert, ...)`) is not declarations.
  if (isTrigger) code = code.replace(/^[^{]*/, blank);
  return code;
}

function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

/** Every { } block: { start, end, kind: "class" | "other", name }. */
function blocksOf(code) {
  const blocks = [];
  const open = [];
  let segment = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === "{") {
      const header = code.slice(segment, i);
      const type = /\b(class|interface|enum)\s+([A-Za-z_]\w*)[^]*$/i.exec(
        header
      );
      const block = {
        start: i,
        end: code.length,
        kind: type ? "class" : "other",
        name: type ? type[2] : null
      };
      blocks.push(block);
      open.push(block);
    } else if (c === "}") {
      const block = open.pop();
      if (block) block.end = i;
    }
    if (c === "{" || c === "}" || c === ";") segment = i + 1;
  }
  return blocks;
}

function innermost(blocks, at) {
  let found = null;
  for (const b of blocks) {
    if (b.start < at && at < b.end && (!found || b.start > found.start)) {
      found = b;
    }
  }
  return found;
}

function lineAt(code, at) {
  let line = 1;
  for (let i = 0; i < at; i++) if (code[i] === "\n") line++;
  return line;
}

/** Where the statement holding `at` began (just after the last `;`, `{` or `}`). */
function statementStart(code, at) {
  let i = at - 1;
  while (i >= 0 && !";{}".includes(code[i])) i--;
  return i + 1;
}

/** Just after the `;` that ends the statement holding `at` (initializers may hold ( ) { } [ ]). */
function statementEnd(code, at) {
  let depth = 0;
  for (let i = at; i < code.length; i++) {
    if ("({[".includes(code[i])) depth++;
    else if (")}]".includes(code[i])) depth--;
    else if (code[i] === ";" && depth <= 0) return i + 1;
  }
  return code.length;
}

/** The scope after a `( ... )` holding `at`: the block it opens, or up to the next `;`. */
function scopeAfterParens(code, blocks, at) {
  let depth = 0;
  let i = at;
  for (; i < code.length; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")" && depth-- === 0) break;
  }
  const next = code.slice(i + 1).search(/\S/) + i + 1;
  if (code[next] === "{") {
    const block = blocks.find((b) => b.start === next);
    return [next, block ? block.end : code.length];
  }
  const end = code.indexOf(";", next);
  return [next, end === -1 ? code.length : end];
}

/** Every local, parameter and field: { name, line, scope: [from, to], kind }. */
function declarationsOf(code, blocks) {
  const decls = [];
  for (const m of code.matchAll(DECL)) {
    const type = m[1].split(/[\s.<[]/)[0];
    if (NOT_TYPES.has(type.toLowerCase())) continue;
    const at = m.index + m[0].lastIndexOf(m[2]);
    const block = innermost(blocks, at);
    if (!block) continue;
    const start = statementStart(code, at);
    const before = code.slice(start, at);
    const inParens = count(before, "(") > count(before, ")");
    let kind;
    let scope;
    if (inParens) {
      kind = block.kind === "class" ? "parameter" : "local";
      scope = scopeAfterParens(code, blocks, at);
    } else if (block.kind === "class") {
      kind = "field";
      scope = [block.start, block.end];
    } else {
      kind = "local";
      scope = [statementEnd(code, at), block.end];
    }
    decls.push({ name: m[2], line: lineAt(code, at), scope, kind });
  }
  return decls;
}

function count(text, c) {
  return text.split(c).length - 1;
}

/** The variable a use at `at` named `name` gets: the innermost one in scope, or none. */
function bindingOf(decls, name, at) {
  let found = null;
  for (const d of decls) {
    if (
      d.name.toLowerCase() === name.toLowerCase() &&
      d.scope[0] <= at &&
      at < d.scope[1] &&
      (!found || d.scope[0] > found.scope[0])
    ) {
      found = d;
    }
  }
  return found;
}

/** Hits in one Apex file: [{ line, name, kind, clashesWith }]. */
function scanApex(source, classNames, isTrigger = false) {
  const code = codeOf(source, isTrigger);
  const blocks = blocksOf(code);
  const decls = declarationsOf(code, blocks);
  const lines = source.split("\n");
  const types = new Map(classNames.map((n) => [n.toLowerCase(), n]));
  for (const m of code.matchAll(TYPE_DECL)) types.set(m[2].toLowerCase(), m[2]);
  const hits = new Map();
  // A name used with a dot, not itself after a dot (`x.Name.y` is a member).
  for (const m of code.matchAll(/(?<![\w.])([A-Za-z_]\w*)(?=\s*\.)/g)) {
    const used = m[1];
    const d = bindingOf(decls, used, m.index);
    if (!d || d.name === used || hits.has(d)) continue;
    if (OPT_OUT.test(lines[d.line - 1] || "")) continue;
    const other = decls.find((o) => o !== d && o.name === used);
    const type = types.get(used.toLowerCase());
    hits.set(d, {
      line: d.line,
      name: d.name,
      kind: d.kind,
      usedAs: used,
      usedOn: lineAt(code, m.index),
      clashesWith:
        type === used ? `class ${used}` : other ? `${other.kind} ${used}` : used
    });
  }
  return [...hits.values()].sort((a, b) => a.line - b.line);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** { "force-app/...": [hits] } for every class and trigger with at least one hit. */
function scan(root = ROOT) {
  const files = walk(path.join(root, SOURCE))
    .filter((f) => /\.(cls|trigger)$/.test(f))
    .sort();
  const classNames = files
    .filter((f) => f.endsWith(".cls"))
    .map((f) => path.basename(f, ".cls"));
  const result = {};
  for (const full of files) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    const hits = scanApex(
      fs.readFileSync(full, "utf8"),
      classNames,
      rel.endsWith(".trigger")
    );
    if (hits.length) result[rel] = hits;
  }
  return result;
}

function main() {
  const hits = scan();
  const files = Object.keys(hits);
  if (files.length) {
    console.error(
      "Apex name-clash check failed: Apex ignores case, so each variable below takes over a use meant for a class or field, and the class won't compile. Rename the variable, or add `// apex-name-clash-ok: <why>` on its line."
    );
    for (const file of files) {
      console.error(`  ${file}`);
      for (const h of hits[file]) {
        console.error(
          `    line ${h.line}: ${h.kind} ${h.name} is the same name as ${h.clashesWith}, used on line ${h.usedOn}`
        );
      }
    }
    return 1;
  }
  console.log(
    "Apex name-clash check passed: no variable takes over a use meant for a class or field."
  );
  return 0;
}

module.exports = { scan, scanApex };

if (require.main === module) {
  process.exitCode = main();
}
