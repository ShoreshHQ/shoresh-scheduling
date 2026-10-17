#!/usr/bin/env node
/**
 * Namespace-safety ratchet. Once the package has its namespace, Salesforce names every custom
 * field `shoresh__Field__c`, so code that spells a field or object name as text (`"StartDate__c"`,
 * `record.StartDate__c`, `'Week__c'`, `day + '__c'`) finds nothing. This counts those spellings per
 * file and fails if any file has more than the committed baseline allows. The baseline only goes
 * down: a file that improved must have its baseline lowered (`--update`), and in CI a pull request
 * may not raise any file's baseline above the base branch's.
 *
 * What counts (comments never count):
 * - LWC JavaScript: any name, string or template text containing `__c` or `__r`.
 * - LWC HTML: any `__c` / `__r` outside comments.
 * - Apex classes and triggers: string literals containing `__c` / `__r`, and `.getName()` calls
 *   (describe names carry the namespace; use ShoreshSchema instead). Typed references such as
 *   `Week__c.StartDate__c` are compiled and namespace-safe, so they don't count.
 * Not scanned: tests (`__tests__`, `@IsTest` classes) and the two files that are the one home for
 * these names: `lwc/shoreshSchema` and `classes/ShoreshSchema.cls`.
 *
 * Usage:
 *   node scripts/namespace-safety.js                  check against the baseline
 *   node scripts/namespace-safety.js --base <file>    also refuse a baseline raised above <file>
 *   node scripts/namespace-safety.js --update         lower the baseline to today's counts
 */
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("@babel/parser");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = "force-app/main/default";
const BASELINE = "scripts/namespace-safety-baseline.json";
const NAME = /__(c|r)\b/g;
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
    if (!comment && typeof token.value === "string") {
      const n = count(token.value, NAME);
      for (let i = 0; i < n; i++) {
        hits.push({ line: token.loc.start.line, text: token.value });
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
  return hitsByLine(text, /[A-Za-z0-9_]*__(c|r)\b/g);
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
  return /^\s*@istest\b/i.test(code);
}

/** Hits in an Apex file, or null when it is a test class. */
function scanApex(source) {
  const { code, strings } = lexApex(source);
  if (isApexTest(code)) return null;
  const hits = [];
  for (const s of strings) {
    const n = count(s.text, NAME);
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

function counts(hits) {
  return Object.fromEntries(
    Object.entries(hits).map(([f, h]) => [f, h.length])
  );
}

/** Problems comparing today's counts with the baseline (and the base branch's baseline). */
function compare(current, baseline, base) {
  const problems = [];
  for (const [file, n] of Object.entries(current)) {
    const allowed = baseline[file] || 0;
    if (n > allowed) {
      problems.push(
        `${file}: ${n} hardcoded API names, baseline allows ${allowed}. Use c/shoreshSchema (LWC) or ShoreshSchema / typed references (Apex).`
      );
    }
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const n = current[file] || 0;
    if (n < allowed) {
      problems.push(
        `${file}: down to ${n} from ${allowed}. Lock it in: node scripts/namespace-safety.js --update`
      );
    }
    if (base && allowed > (base[file] || 0)) {
      problems.push(
        `${file}: the baseline was raised to ${allowed} (base branch: ${base[file] || 0}). The baseline only goes down.`
      );
    }
  }
  return problems;
}

/** The lowered baseline: today's counts, never above the old baseline. */
function lowered(current, baseline) {
  const result = {};
  for (const [file, n] of Object.entries(current)) {
    result[file] = Math.min(n, baseline[file] || 0);
  }
  return result;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function main(argv) {
  const hits = scan();
  const current = counts(hits);
  const baselineFile = path.join(ROOT, BASELINE);
  const exists = fs.existsSync(baselineFile);
  const baseline = exists ? readJson(baselineFile) : {};
  if (argv.includes("--update")) {
    // The very first baseline records today's counts; after that it only goes down.
    const next = exists ? lowered(current, baseline) : current;
    fs.writeFileSync(baselineFile, JSON.stringify(next, null, 2) + "\n");
    const total = Object.values(next).reduce((a, b) => a + b, 0);
    console.log(
      `Baseline written: ${total} in ${Object.keys(next).length} files.`
    );
    const raised = Object.keys(current).filter((f) => current[f] > next[f]);
    if (raised.length) {
      console.error(`Not raised (still failing): ${raised.join(", ")}`);
      return 1;
    }
    return 0;
  }
  const baseIndex = argv.indexOf("--base");
  const base = baseIndex >= 0 ? readJson(argv[baseIndex + 1]) : null;
  const problems = compare(current, baseline, base);
  const total = Object.values(current).reduce((a, b) => a + b, 0);
  if (problems.length) {
    console.error("Namespace-safety check failed:");
    for (const p of problems) {
      console.error(`  ${p}`);
      const file = p.split(":")[0];
      for (const h of (hits[file] || []).slice(0, 20)) {
        console.error(`    line ${h.line}: ${h.text}`);
      }
    }
    return 1;
  }
  console.log(
    `Namespace-safety check passed: ${total} hardcoded API names left in ${Object.keys(current).length} files (none added).`
  );
  return 0;
}

module.exports = { scan, scanJs, scanHtml, scanApex, counts, compare, lowered };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
