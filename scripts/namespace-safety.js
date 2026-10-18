#!/usr/bin/env node
/**
 * Namespace-safety check. Once the package has its namespace, Salesforce names every custom
 * field `shoresh__Field__c`, so code that spells a field or object name as text (`"StartDate__c"`,
 * `record.StartDate__c`, `'Week__c'`, `day + '__c'`) finds nothing. Every such spelling has been
 * replaced (docs/adr/0009-namespace-safe-names.md), so the check allows none: one is a failure.
 *
 * What counts (comments never count). A "custom name" ends in one of the suffixes the namespace
 * goes in front of: `__c`, `__r`, `__mdt` (custom metadata), `__e` (platform events), `__Share`,
 * `__History`, `__x` (external objects), `__b` (big objects).
 * - LWC JavaScript: any name, string, template text or regex containing a custom name.
 * - LWC HTML: any custom name outside comments.
 * - Apex classes and triggers: string literals containing a custom name, and `.getName()` calls
 *   (describe names carry the namespace; use ShoreshSchema instead). Typed references such as
 *   `Week__c.StartDate__c` are compiled and namespace-safe, so they don't count.
 * Not caught: a typed reference turned into text (`String.valueOf(Week__c.StartDate__c)`, `'' + token`);
 * reviewers watch for those.
 * Not scanned: tests (`__tests__`, `@IsTest` classes) and the two files that are the one home for
 * these names: `lwc/shoreshSchema` and `classes/ShoreshSchema.cls`.
 *
 * Usage: node scripts/namespace-safety.js   (exit 1, listing each one, if any is found)
 */
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("@babel/parser");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = "force-app/main/default";
const SUFFIXES = "c|r|mdt|e|Share|History|x|b";
const NAME = new RegExp(`__(${SUFFIXES})\\b`, "g");
// Apex and SOQL ignore case, so `week__C` is the same name there.
const APEX_NAME = new RegExp(`__(${SUFFIXES})\\b`, "gi");
const ALLOWED = [
  `${SOURCE}/lwc/shoreshSchema/`,
  `${SOURCE}/classes/ShoreshSchema.cls`
];

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

/** Each hit as { line, text } in an LWC JavaScript file (names, strings, template text). */
function scanJs(source) {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["decorators-legacy", "classProperties"],
    tokens: true
  });
  const hits = [];
  for (const token of ast.tokens) {
    // Babel lists comments among the tokens too (type "CommentLine" / "CommentBlock").
    const comment =
      typeof token.type === "string" && token.type.startsWith("Comment");
    // Regular expressions (/__c$/) count too: their token value is { pattern, flags }.
    const text =
      token.value && typeof token.value.pattern === "string"
        ? token.value.pattern
        : token.value;
    if (!comment && typeof text === "string") {
      const n = count(text, NAME);
      for (let i = 0; i < n; i++) {
        hits.push({ line: token.loc.start.line, text });
      }
    }
  }
  return hits;
}

/** Each hit in an LWC template, comments removed (line numbers kept). */
function scanHtml(source) {
  const text = source.replace(/<!--[\s\S]*?-->/g, (c) =>
    c.replace(/[^\n]/g, " ")
  );
  return hitsByLine(text, new RegExp(`[A-Za-z0-9_]*__(${SUFFIXES})\\b`, "g"));
}

function hitsByLine(text, pattern) {
  const hits = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(pattern)) {
      hits.push({ line: i + 1, text: m[0] });
    }
  });
  return hits;
}

/**
 * Apex split into code (strings blanked) and string literals, comments dropped; line numbers kept.
 */
function lexApex(source) {
  let code = "";
  const strings = [];
  let line = 1;
  for (let i = 0; i < source.length;) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      i += 2;
      while (
        i < source.length &&
        !(source[i] === "*" && source[i + 1] === "/")
      ) {
        if (source[i] === "\n") {
          code += "\n";
          line++;
        }
        i++;
      }
      i += 2;
    } else if (c === "'") {
      let value = "";
      i++;
      while (i < source.length && source[i] !== "'") {
        if (source[i] === "\\") {
          value += source[i + 1];
          i += 2;
        } else {
          value += source[i++];
        }
      }
      i++;
      strings.push({ line, text: value });
      code += "''";
    } else {
      if (c === "\n") line++;
      code += c;
      i++;
    }
  }
  return { code, strings };
}

function isApexTest(code) {
  // @IsTest among the class's annotations (others, such as @SuppressWarnings, may come first).
  return /^\s*(@\w+(\s*\([^)]*\))?\s*)*@istest\b/i.test(code);
}

/** Hits in an Apex file, or null when it is a test class. */
function scanApex(source) {
  const { code, strings } = lexApex(source);
  if (isApexTest(code)) return null;
  const hits = [];
  for (const s of strings) {
    const n = count(s.text, APEX_NAME);
    for (let i = 0; i < n; i++)
      hits.push({ line: s.line, text: `'${s.text}'` });
  }
  hits.push(...hitsByLine(code, /\.getName\(\s*\)/g));
  return hits.sort((a, b) => a.line - b.line);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" || entry.name === "jest-mocks"
        ? []
        : walk(full);
    }
    return [full];
  });
}

/** { "force-app/...": [hits] } for every scanned file with at least one hit. */
function scan(root = ROOT) {
  const result = {};
  for (const full of walk(path.join(root, SOURCE)).sort()) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (ALLOWED.some((a) => rel.startsWith(a))) continue;
    const source = fs.readFileSync(full, "utf8");
    let hits = [];
    if (rel.includes("/lwc/") && rel.endsWith(".js")) hits = scanJs(source);
    else if (rel.includes("/lwc/") && rel.endsWith(".html"))
      hits = scanHtml(source);
    else if (/\.(cls|trigger)$/.test(rel)) hits = scanApex(source) || [];
    if (hits.length) result[rel] = hits;
  }
  return result;
}

function main() {
  const hits = scan();
  const files = Object.keys(hits);
  if (files.length) {
    console.error(
      "Namespace-safety check failed: field or object names written as text. Use c/shoreshSchema (LWC) or ShoreshSchema / typed references (Apex)."
    );
    for (const file of files) {
      console.error(`  ${file}`);
      for (const h of hits[file]) {
        console.error(`    line ${h.line}: ${h.text}`);
      }
    }
    return 1;
  }
  console.log(
    "Namespace-safety check passed: no field or object names written as text."
  );
  return 0;
}

module.exports = { scan, scanJs, scanHtml, scanApex, lexApex };

if (require.main === module) {
  process.exitCode = main();
}
