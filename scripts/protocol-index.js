/**
 * The protocol's conformance index (docs/protocol/README.md): every statement ID in the protocol
 * documents, and whether a test names it.
 *
 *   ENCODED         a test names the ID in its title or the comment directly above it (or its
 *                   describe's), and asserts something;
 *   MAPPED          the sub-protocol's own document names a test, but no test names the ID yet;
 *   NOT YET TESTED  neither.
 * Every test a Test cell names must also exist (`missing` lists any that don't).
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
          out.push({ id: `GEN-${m[1]}`, mapped: namesATest(test), test });
        }
      }
      return out;
    }
  },
  numberedRules("docs/import/files.md", "INGEST-1"),
  numberedRules("docs/import/names-and-divisions.md", "INGEST-2"),
  numberedRules("docs/import/classification.md", "INGEST-3"),
  numberedRules("docs/import/weeks.md", "INGEST-4"),
  numberedRules("docs/import/review.md", "INGEST-5"),
  statementTable("docs/protocol/elect.md", "ELECT"),
  statementTable("docs/protocol/pub.md", "PUB"),
  statementTable("docs/protocol/memo.md", "MEMO"),
  statementTable("docs/protocol/special.md", "SPECIAL"),
  statementTable("docs/protocol/close.md", "CLOSE"),
  statementTable("docs/protocol/lock.md", "LOCK"),
  statementTable("docs/protocol/div.md", "DIV"),
  statementTable("docs/protocol/prog.md", "PROG"),
  statementTable("docs/protocol/week.md", "WEEK"),
  statementTable("docs/protocol/api.md", "API")
];

/** A test cell starting "gap", "not yet tested", "none", "not built" or "contradicted" names no test. */
function namesATest(cell) {
  return !/^(gap|not yet tested|none|not built|contradicted)/i.test(cell);
}

/** A sub-protocol's table, "| PREFIX-n.m | statement | source | test |". */
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
          out.push({ id: m[1], mapped: namesATest(test), test });
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
          // Only the tests the rule names first: its counter-case and code quote the file too.
          const test = /\bTest:([\s\S]*?)(Counter-case|Code:|$)/.exec(own);
          out.push({
            id: `${prefix}.${m[1]}`,
            mapped: Boolean(test),
            test: test ? test[1] : ""
          });
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

/**
 * The tests in one file. Each has a name, the text its IDs are read from (its title, and the
 * comment lines directly above it) and its body, up to the next test.
 *   Jest: it(...) / test(...), titled by its first string. A describe's IDs (its title, or the
 *         comment directly above it) attach to every test inside it.
 *   Apex: an @IsTest method, named by the method.
 */
function testsIn(file, text) {
  const lines = text.split("\n");
  const apex = file.endsWith(".cls");
  const above = (i) => {
    let top = i;
    while (top > 0 && /^\s*(\/\/|\/\*|\*)/.test(lines[top - 1])) top -= 1;
    return lines.slice(top, i).join("\n");
  };
  // A block runs from its line to the "}" at its own indent (the code is Prettier-formatted),
  // or is that one line when it closes there.
  const endOf = (i, indent) => {
    if (/\);?\s*$/.test(lines[i]) && !/[({[]\s*$/.test(lines[i])) return i + 1;
    const close = new RegExp(`^${indent}[})]`);
    let end = i + 1;
    while (end < lines.length && !close.test(lines[end])) end += 1;
    return end + 1;
  };
  // Each describe; a skipped one (describe.skip, xdescribe) proves nothing inside it.
  const groups = [];
  if (!apex) {
    lines.forEach((line, i) => {
      const m = /^(\s*)(x?)describe(\.each|\.only|\.skip)?\s*\(/.exec(line);
      if (!m) return;
      groups.push({
        start: i,
        end: endOf(i, m[1]),
        skipped: Boolean(m[2]) || m[3] === ".skip",
        cites: `${above(i)}\n${line}${line.endsWith("(") ? `\n${lines[i + 1]}` : ""}`
      });
    });
  }
  // Each test: an @IsTest method (not the class), or an it/test that isn't skipped.
  const found = [];
  lines.forEach((line, i) => {
    const m = apex
      ? /^(\s*)@IsTest\b/i.exec(line)
      : /^(\s*)(it|test)(\.each|\.only)?\s*\(/.exec(line);
    if (!m) return;
    if (apex && /\bclass\b/.test(`${line} ${lines[i + 1] || ""}`)) return;
    found.push({ start: i, end: endOf(apex ? i + 1 : i, m[1]) });
  });
  const titled = groups.map((g) => ({
    file,
    name: title(lines.slice(g.start, g.end).join("\n")),
    cites: "",
    asserts: false
  }));
  return titled.concat(
    found.map(({ start, end }) => {
      const around = groups.filter((g) => g.start < start && start < g.end);
      const comment = [above(start), ...around.map((g) => g.cites)].join("\n");
      const rest = lines.slice(start, end).join("\n");
      let name;
      if (apex) {
        const m = /\b(\w+)\s*\(/.exec(
          rest.replace(/^\s*@IsTest(\([^)]*\))?/i, "")
        );
        name = m ? m[1] : "";
      } else {
        name = title(rest);
      }
      // Its own body, comments left out, must assert.
      const code = rest.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      const asserts =
        !around.some((g) => g.skipped) &&
        (apex
          ? /\b(Assert\.|System\.assert)/.test(code)
          : /\bexpect\w*\s*\(|\bassert\w*\s*\(/.test(code));
      return { file, name, cites: `${comment}\n${name}`, asserts };
    })
  );
}

/** A Jest it or describe's title: its first string (after the table, for .each). */
function title(source) {
  const from = /^\s*\w+\.each/.test(source) ? source.indexOf(")(") + 2 : 0;
  const m = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/.exec(source.slice(from));
  return m ? m[2] : "";
}

/**
 * The tests a document's Test cell names that no test file has: an Apex method after its
 * class (a class ending in Test), or a quoted Jest title (up to any "…"), or a camelCase name
 * after a .test.js file. Each must be the name of a test or describe that exists.
 */
function missingTests(cell, tests) {
  const flat = (text) => text.replace(/\s+/g, " ").trim();
  // Quotes inside a title ('"No group limit" means…') are not compared.
  const plain = (text) => flat(text.replace(/["']/g, ""));
  // Whether a quote (cut at any "…") is part of a title. An it.each's %s or $name stands for
  // any words: each fixed piece of the title is found in turn, the last perhaps cut short.
  const names = (quoted, name) => {
    let rest = quoted;
    const pieces = plain(name).split(/%[sdipfjo#]|\$\w+/);
    if (pieces.length === 1) return pieces[0].includes(quoted);
    for (const piece of pieces) {
      const at = rest.indexOf(piece.trim());
      if (at < 0) return piece.trim().startsWith(rest.trim());
      rest = rest.slice(at + piece.trim().length);
    }
    return true;
  };
  const missing = [];
  for (const part of flat(cell).split(/[;|]/)) {
    let current = null;
    for (const word of part.match(/"[^"]*"|“[^”]*”|[\w.-]+/g) || []) {
      if (/^["“]/.test(word)) {
        const quoted = plain(word.slice(1, -1).split("…")[0]);
        if (quoted && !tests.some((t) => t.name && names(quoted, t.name)))
          missing.push(quoted);
        continue;
      }
      const [name, method] = word
        .replace(/\.cls$/, "")
        .split(/\.(?=[a-z]\w*$)/);
      if (/^[A-Z]\w*Test$/.test(name)) {
        current = name;
        if (!tests.some((t) => t.file.endsWith(`/${name}.cls`)))
          missing.push(name);
        if (method) check(method);
        continue;
      }
      if (/\.test\.js$/.test(word)) {
        current = word;
        if (!tests.some((t) => t.file.endsWith(`/${word}`))) missing.push(word);
        continue;
      }
      // A screen module's name (shoreshLearned) starts its own tests; another camelCase
      // name is a test method, or the start of a Jest title.
      if (/^shoresh[A-Z]/.test(word)) current = null;
      else if (current && /^[a-z]+[A-Z]\w*$/.test(word)) check(word);
    }
    function check(word) {
      const own = tests.filter((t) =>
        t.file.endsWith(
          current.endsWith(".js") ? `/${current}` : `/${current}.cls`
        )
      );
      if (!own.some((t) => t.name === word || t.name.startsWith(`${word}:`)))
        missing.push(`${current} ${word}`);
    }
  }
  return missing;
}

/** A test proves a statement when it names the ID (title or comment above) and asserts. */
function proves(test, id) {
  const pattern = new RegExp(`\\b${id.replace(".", "\\.")}(?!\\d)`);
  return test.asserts && pattern.test(test.cites);
}

/**
 * The named cases in the engine's test data (data/oddCamps.js and the like): a describe.each
 * over them runs one set of tests per case, titled by its name.
 */
function dataCases(root) {
  const dir = path.join(
    root,
    "force-app/main/default/lwc/shoreshEngine/__tests__/data"
  );
  return fs.readdirSync(dir).flatMap((f) =>
    [
      ...fs
        .readFileSync(path.join(dir, f), "utf8")
        .matchAll(/^\s*name: "([^"]+)"/gm)
    ].map((m) => ({
      file: path.relative(root, path.join(dir, f)),
      name: m[1],
      cites: "",
      asserts: false
    }))
  );
}

/** Every statement, in document order, with its status and the tests that prove it. */
function protocolIndex(root = ROOT) {
  const tests = ["force-app", "jest", "scripts", "connect"]
    .map((d) => path.join(root, d))
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => testFiles(d))
    .flatMap((file) =>
      testsIn(path.relative(root, file), fs.readFileSync(file, "utf8"))
    )
    .concat(dataCases(root));
  const statements = [];
  for (const doc of DOCUMENTS) {
    const text = fs.readFileSync(path.join(root, doc.file), "utf8");
    for (const { id, mapped, test = "" } of doc.read(text)) {
      const citedBy = tests
        .filter((t) => proves(t, id))
        .map((t) => `${t.file} ${t.name}`);
      const status = citedBy.length
        ? "ENCODED"
        : mapped
          ? "MAPPED"
          : "NOT YET TESTED";
      statements.push({
        id,
        document: doc.file,
        status,
        citedBy,
        missing: missingTests(test, tests)
      });
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

module.exports = { protocolIndex, counts, testsIn, proves, missingTests };

if (require.main === module) {
  const statements = protocolIndex();
  const width = Math.max(...statements.map((s) => s.id.length));
  for (const s of statements) {
    const by = s.citedBy.length ? `  ${s.citedBy.join(", ")}` : "";
    console.log(`${s.id.padEnd(width)}  ${s.status.padEnd(14)}${by}`);
    for (const m of s.missing)
      console.log(`${"".padEnd(width)}  no such test: ${m}`);
  }
  const c = counts(statements);
  console.log(
    `\n${c.total} statements: ${c.ENCODED} encoded, ${c.MAPPED} mapped, ${c["NOT YET TESTED"]} not yet tested`
  );
}
