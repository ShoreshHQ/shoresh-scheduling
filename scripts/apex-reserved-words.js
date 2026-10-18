#!/usr/bin/env node
/**
 * Apex reserved-word check. A local, parameter, field, class, interface or enum named with an
 * Apex reserved keyword (`Integer number`, `List<String> into`) doesn't compile, and only the
 * org's compiler says so ("Identifier name is reserved"): #46 (`number`), and earlier `into` in
 * import undo. Apex ignores case, so `Number` and `INTO` count too.
 *
 * The list is Salesforce's, copied word for word and in order from the Apex Developer Guide,
 * Reserved Keywords (Winter '27, API 68.0), retrieved 2026-10-18 (`sObject` lowercased):
 * https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_reserved_words.htm
 * Its "special keywords" (after, before, count, excludes, first, includes, last, order, sharing,
 * with) can be names, so they are not checked. Enum values are checked; methods are not. Declarations are found
 * as in scripts/apex-name-clash.js (regular expressions, not a parser).
 *
 * Usage: node scripts/apex-reserved-words.js   (exit 1, listing each one, if any is found)
 */
const fs = require("node:fs");
const path = require("node:path");
const { codeOf, blocksOf, declarationsOf, walk } = require("./apex-name-clash");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = "force-app";
const RESERVED = new Set(
  (
    "abstract activate and any array as asc autonomous begin bigdecimal blob boolean break bulk " +
    "by byte case cast catch char class collect commit const continue currency date datetime " +
    "decimal default delete desc do double else end enum exception exit export extends false " +
    "final finally float for from global goto group having hint if implements import in inner " +
    "insert instanceof int integer interface into join like limit list long loop map merge new " +
    "not null nulls number object of on or outer override package parallel pragma private " +
    "protected public retrieve return rollback select set short sobject sort static string " +
    "super switch synchronized system testmethod then this throw time transaction trigger true " +
    "try undelete update upsert using virtual void webservice when where while"
  ).split(" ")
);
const TYPE_DECL = /\b(class|interface|enum)\s+([A-Za-z_]\w*)/gi;

function lineAt(code, at) {
  return code.slice(0, at).split("\n").length;
}

/** Hits in one Apex file: [{ line, name, kind }]. */
function scanApex(source, isTrigger = false) {
  const code = codeOf(source, isTrigger);
  const hits = declarationsOf(code, blocksOf(code))
    .filter((d) => RESERVED.has(d.name.toLowerCase()))
    .map((d) => ({ line: d.line, name: d.name, kind: d.kind }));
  for (const m of code.matchAll(TYPE_DECL)) {
    const at = m.index + m[0].lastIndexOf(m[2]);
    const kind = m[1].toLowerCase();
    if (RESERVED.has(m[2].toLowerCase())) {
      hits.push({ line: lineAt(code, at), name: m[2], kind });
    }
    if (kind === "enum") {
      // Enum values: `enum Sort { FIRST, NUMBER }`.
      const open = code.indexOf("{", at);
      const close = code.indexOf("}", open);
      for (const v of code.slice(open + 1, close).matchAll(/[A-Za-z_]\w*/g)) {
        if (RESERVED.has(v[0].toLowerCase())) {
          const where = open + 1 + v.index;
          hits.push({
            line: lineAt(code, where),
            name: v[0],
            kind: "enum value"
          });
        }
      }
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

/** { "force-app/...": [hits] } for every class and trigger with at least one hit. */
function scan(root = ROOT) {
  const result = {};
  const files = walk(path.join(root, SOURCE))
    .filter((f) => /\.(cls|trigger)$/.test(f))
    .sort();
  for (const full of files) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    const hits = scanApex(
      fs.readFileSync(full, "utf8"),
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
      "Apex reserved-word check failed: these names are Apex reserved keywords (case doesn't matter) and won't compile. Rename them."
    );
    for (const file of files) {
      console.error(`  ${file}`);
      for (const h of hits[file]) {
        console.error(`    line ${h.line}: ${h.kind} ${h.name}`);
      }
    }
    return 1;
  }
  console.log(
    "Apex reserved-word check passed: no name is an Apex reserved keyword."
  );
  return 0;
}

module.exports = { scan, scanApex, RESERVED };

if (require.main === module) {
  process.exitCode = main();
}
