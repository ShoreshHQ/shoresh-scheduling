#!/usr/bin/env node
/**
 * Lightning-input check. When a screen sends an object to an @AuraEnabled method (a parameter
 * typed as one of our classes), Salesforce fills only the class's properties
 * (`@AuraEnabled public String x { get; set; }`); a plain field (`@AuraEnabled public String x;`)
 * arrives empty, with no error. Apex tests call the method directly and Jest mocks it, so only a
 * real browser shows it: every "Update to match setup" was refused as "Someone else changed this
 * week since" because SetupMatch.Ask's revisions arrived empty (real-browser check, 2026-10-20).
 *
 * This finds every class an @AuraEnabled method takes (and the classes those take, through
 * their @AuraEnabled members) and lists each @AuraEnabled member of them that is a plain field.
 * What a method only sends back is not checked: fields serialize. A field the server never reads
 * back opts out with a comment on one of the three lines above it saying why:
 * `// apex-aura-inputs-ok: shown to the screen only`. Regular expressions over the
 * code with comments and strings blanked (scripts/apex-name-clash.js), not a parser.
 *
 * Usage: node scripts/apex-aura-inputs.js   (exit 1, listing each one, if any is found)
 */
const fs = require("node:fs");
const path = require("node:path");
const { codeOf, walk } = require("./apex-name-clash");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = "force-app";
const MODS =
  "(?:(?:public|global|private|protected|static|transient|final|virtual|override)\\s+)*";
const ANNOTATION = "@AuraEnabled\\s*(?:\\([^)]*\\))?\\s*";
const TYPE = "([A-Za-z_][\\w.]*(?:\\s*<[\\w.<>,\\s]*>)?)";
// An @AuraEnabled member: a method ("("), a property ("{") or a field (";" or "=").
const MEMBER = new RegExp(
  `${ANNOTATION}${MODS}${TYPE}\\s+([A-Za-z_]\\w*)\\s*([(;={])`,
  "gi"
);
const OPT_OUT = /apex-aura-inputs-ok:\s*\S/;
const CLASS_DECL = /\bclass\s+([A-Za-z_]\w*)[^{;]*\{/gi;

function lineAt(code, at) {
  return code.slice(0, at).split("\n").length;
}

/** The index of the brace that closes the one at `open`. */
function closing(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return i;
  }
  return code.length;
}

/** The names a type mentions: `List<SlotEdits.Edit>` → ["List", "SlotEdits.Edit"]. */
function typeNames(type) {
  return type.match(/[A-Za-z_][\w.]*/g) || [];
}

/** The parameter types of a parameter list (`Id scheduleId, SetupMatch.Ask ask`). */
function parameterTypes(list) {
  const params = [];
  let depth = 0;
  let current = "";
  for (const c of list) {
    if (c === "<") depth++;
    if (c === ">") depth--;
    if (c === "," && depth === 0) {
      params.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  if (current.trim()) params.push(current);
  // Drop the parameter's own name (and `final`).
  return params.map((p) =>
    p
      .trim()
      .replace(/^final\s+/i, "")
      .replace(/\s+[A-Za-z_]\w*$/, "")
  );
}

/**
 * Every class in one file: [{ name ("Outer" or "Outer.Inner"), outer, members }], members being
 * its own @AuraEnabled members [{ name, type, kind: method|property|field, line, params }].
 */
function classesOf(source, fileName) {
  const code = codeOf(source, false);
  const outerName = fileName.replace(/\.cls$/, "");
  const found = [];
  for (const m of code.matchAll(CLASS_DECL)) {
    const open = m.index + m[0].length - 1;
    found.push({ name: m[1], open, close: closing(code, open) });
  }
  if (!found.length) return [];
  const [outer, ...inner] = found;
  return found.map((c) => {
    const isOuter = c === outer;
    let body = code.slice(c.open + 1, c.close);
    if (isOuter) {
      // The outer class's own members: its inner classes' bodies blanked.
      for (const i of inner) {
        const from = i.open + 1 - (c.open + 1);
        const to = i.close - (c.open + 1);
        body =
          body.slice(0, from) +
          body.slice(from, to).replace(/[^\n]/g, " ") +
          body.slice(to);
      }
    }
    const members = [];
    for (const mm of body.matchAll(MEMBER)) {
      const end = mm[3];
      const at = c.open + 1 + mm.index;
      let params = [];
      if (end === "(") {
        const start = at + mm[0].length;
        params = parameterTypes(code.slice(start, code.indexOf(")", start)));
      }
      members.push({
        name: mm[2],
        type: mm[1],
        kind: end === "(" ? "method" : end === "{" ? "property" : "field",
        line: lineAt(code, at + mm[0].lastIndexOf(mm[2])),
        params
      });
    }
    return {
      name: isOuter ? outerName : `${outerName}.${c.name}`,
      outer: outerName,
      members
    };
  });
}

/** { "force-app/...": [{ line, name }] }: plain fields of classes a Lightning call sends. */
function scanSources(files) {
  const byName = new Map();
  for (const { rel, source } of files) {
    const base = path.basename(rel);
    const lines = source.split("\n");
    for (const c of classesOf(source, base)) {
      byName.set(c.name.toLowerCase(), { ...c, rel, lines });
    }
  }
  // A type name as written inside `outer`: its own inner class, or a class of its own.
  const resolve = (name, outer) => {
    const lower = name.toLowerCase();
    const inner = `${outer}.${name}`.toLowerCase();
    if (!lower.includes(".") && byName.has(inner)) return inner;
    return byName.has(lower) ? lower : null;
  };
  const queue = [];
  for (const c of byName.values()) {
    for (const m of c.members.filter((x) => x.kind === "method")) {
      for (const type of m.params) {
        for (const n of typeNames(type)) {
          const r = resolve(n, c.outer);
          if (r) queue.push(r);
        }
      }
    }
  }
  const inputs = new Set();
  while (queue.length) {
    const name = queue.pop();
    if (inputs.has(name)) continue;
    inputs.add(name);
    const c = byName.get(name);
    for (const m of c.members.filter((x) => x.kind !== "method")) {
      for (const n of typeNames(m.type)) {
        const r = resolve(n, c.outer);
        if (r) queue.push(r);
      }
    }
  }
  const result = {};
  for (const name of [...inputs].sort()) {
    const c = byName.get(name);
    const optedOut = (m) =>
      c.lines
        .slice(Math.max(0, m.line - 4), m.line)
        .some((l) => OPT_OUT.test(l));
    for (const m of c.members.filter(
      (x) => x.kind === "field" && !optedOut(x)
    )) {
      (result[c.rel] = result[c.rel] || []).push({
        line: m.line,
        name: `${c.name}.${m.name}`
      });
    }
  }
  for (const hits of Object.values(result))
    hits.sort((a, b) => a.line - b.line);
  return result;
}

function scan(root = ROOT) {
  const files = walk(path.join(root, SOURCE))
    .filter((f) => f.endsWith(".cls"))
    .sort()
    .map((full) => ({
      rel: path.relative(root, full).split(path.sep).join("/"),
      source: fs.readFileSync(full, "utf8")
    }));
  return scanSources(files);
}

function main() {
  const hits = scan();
  const files = Object.keys(hits);
  if (files.length) {
    console.error(
      "Lightning-input check failed: a screen sends these classes to Apex, and Salesforce leaves a plain field empty. Make each a property: @AuraEnabled public Type name { get; set; }"
    );
    for (const file of files) {
      console.error(`  ${file}`);
      for (const h of hits[file]) {
        console.error(`    line ${h.line}: ${h.name}`);
      }
    }
    return 1;
  }
  console.log(
    "Lightning-input check passed: every class a screen sends to Apex has properties, not plain fields."
  );
  return 0;
}

module.exports = { scan, scanSources, classesOf };

if (require.main === module) {
  process.exitCode = main();
}
