/**
 * The protocol's conformance index (docs/protocol/README.md): every statement ID in the protocol
 * documents, and whether a test names it.
 *
 *   ENCODED         a test file names the ID (title or comment);
 *   MAPPED          the sub-protocol's own document names a test, but no test names the ID yet;
 *   NOT YET TESTED  neither.
 *
 * Run: node scripts/protocol-index.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/** Each protocol document, and how its statement IDs are read from it. */
const DOCUMENTS = [
  {
    file: "docs/protocol/core.md",
    read(text) {
      const out = [];
      for (const line of text.split("\n")) {
        const m =
          /^- \*\*(CORE-\d+\.\d+)\*\*/.exec(line) ||
          /^\| (CORE-\d+\.\d+) +\|/.exec(line);
        if (m) out.push({ id: m[1], mapped: false });
      }
      return out;
    }
  },
  {
    file: "docs/engine/protocol.md",
    read(text) {
      const out = [];
      for (const line of text.split("\n")) {
        const m = /^\| (\d+\.\d+) +\|/.exec(line);
        if (m) {
          const cells = line
            .split("|")
            .map((c) => c.trim())
            .filter(Boolean);
          const test = cells[cells.length - 1];
          out.push({ id: `GEN-${m[1]}`, mapped: !/^gap\b/i.test(test) });
        }
      }
      return out;
    }
  },
  numberedRules("docs/import/names-and-divisions.md", "INGEST-2"),
  numberedRules("docs/import/classification.md", "INGEST-3"),
  statementTable("docs/protocol/elect.md", "ELECT"),
  statementTable("docs/protocol/pub.md", "PUB"),
  statementTable("docs/protocol/memo.md", "MEMO"),
  statementTable("docs/protocol/special.md", "SPECIAL"),
  statementTable("docs/protocol/close.md", "CLOSE"),
  statementTable("docs/protocol/lock.md", "LOCK"),
  statementTable("docs/protocol/div.md", "DIV"),
  statementTable("docs/protocol/prog.md", "PROG"),
  statementTable("docs/protocol/week.md", "WEEK")
];

/** A sub-protocol's table, "| PREFIX-n.m | statement | source | test |"; a test cell starting
 * "gap", "not yet tested", "none", "not built" or "contradicted" names no test. */
function statementTable(file, prefix) {
  const row = new RegExp(`^\\| (${prefix}-\\d+\\.\\d+) +\\|`);
  return {
    file,
    read(text) {
      const out = [];
      for (const line of text.split("\n")) {
        const m = row.exec(line);
        if (m) {
          const cells = line
            .split("|")
            .map((c) => c.trim())
            .filter(Boolean);
          const test = cells[cells.length - 1];
          out.push({
            id: m[1],
            mapped: !/^(gap|not yet tested|none|not built|contradicted)/i.test(
              test
            )
          });
        }
      }
      return out;
    }
  };
}

/** Rules written "1. **Title**", each with a "Test:" line in its paragraph. */
function numberedRules(file, prefix) {
  return {
    file,
    read(text) {
      const out = [];
      const parts = text.split(/\n(?=\d+\. \*\*)/);
      for (const part of parts) {
        const m = /^(\d+)\. \*\*/.exec(part);
        if (m) {
          const own = part.split(/\n(?=#)/)[0];
          out.push({ id: `${prefix}.${m[1]}`, mapped: /\bTest:/.test(own) });
        }
      }
      return out;
    }
  };
}

const TEST_FILE = /(\.test\.js|Test\.cls)$/;

function testFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) testFiles(full, found);
    else if (TEST_FILE.test(entry.name)) found.push(full);
  }
  return found;
}

/** Every statement, in document order, with its status and the test files that name it. */
function protocolIndex(root = ROOT) {
  const tests = ["force-app", "jest", "scripts"]
    .map((d) => path.join(root, d))
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => testFiles(d))
    .map((file) => ({
      file: path.relative(root, file),
      text: fs.readFileSync(file, "utf8")
    }));
  const statements = [];
  for (const doc of DOCUMENTS) {
    const text = fs.readFileSync(path.join(root, doc.file), "utf8");
    for (const { id, mapped } of doc.read(text)) {
      const pattern = new RegExp(`\\b${id.replace(".", "\\.")}(?!\\d)`);
      const citedBy = tests
        .filter((t) => pattern.test(t.text))
        .map((t) => t.file);
      const status = citedBy.length
        ? "ENCODED"
        : mapped
          ? "MAPPED"
          : "NOT YET TESTED";
      statements.push({ id, document: doc.file, status, citedBy });
    }
  }
  return statements;
}

function counts(statements) {
  const out = {
    total: statements.length,
    ENCODED: 0,
    MAPPED: 0,
    "NOT YET TESTED": 0
  };
  for (const s of statements) out[s.status] += 1;
  return out;
}

module.exports = { protocolIndex, counts };

if (require.main === module) {
  const statements = protocolIndex();
  const width = Math.max(...statements.map((s) => s.id.length));
  for (const s of statements) {
    const by = s.citedBy.length ? `  ${s.citedBy.join(", ")}` : "";
    console.log(`${s.id.padEnd(width)}  ${s.status.padEnd(14)}${by}`);
  }
  const c = counts(statements);
  console.log(
    `\n${c.total} statements: ${c.ENCODED} encoded, ${c.MAPPED} mapped, ${c["NOT YET TESTED"]} not yet tested`
  );
}
