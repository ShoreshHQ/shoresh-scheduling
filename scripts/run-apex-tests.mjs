#!/usr/bin/env node
/**
 * Runs every Apex test class in force-app, one class at a time and directly (synchronously),
 * then prints one line per class, a summary, and the code coverage of the classes and triggers
 * in force-app, merged from what each of these runs covered.
 *
 * Why: queued test runs (the usual `sf apex run test --test-level RunLocalTests`) count against
 * the test org's daily allowance of 500 queued test classes. CI and working sessions share one
 * test org, so a busy day used it up and every queued run failed. Direct single-class runs do
 * not count against it. See docs/ci-setup.md.
 *
 * Usage: node scripts/run-apex-tests.mjs [--target-org <alias>]
 * Exits 1 if no test class is found, any class fails, cannot run, or takes longer than 10
 * minutes, or coverage is below 75%.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MIN_COVERAGE = 75;
const CLASS_TIMEOUT_MS = 10 * 60 * 1000;
const args = process.argv.slice(2);
const orgIndex = args.indexOf("--target-org");
const orgArgs = orgIndex >= 0 ? ["--target-org", args[orgIndex + 1]] : [];

/** Every file under a folder with one of the extensions. */
function files(dir, extensions) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return files(path, extensions);
    }
    return extensions.some((ext) => name.endsWith(ext)) ? [path] : [];
  });
}

const baseName = (file) =>
  file
    .split("/")
    .pop()
    .replace(/\.(cls|trigger)$/, "");

/** Apex source without comments, so a commented-out @IsTest does not count. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

/**
 * Whether a class has test methods: an @IsTest annotation (with or without arguments, before or
 * after other annotations) after the class is declared, or a testMethod. A class marked @IsTest
 * with no test methods (test data helpers) has nothing to run.
 */
function hasTestMethods(source) {
  const code = withoutComments(source);
  const declared = code.search(/\bclass\b/i);
  return (
    declared >= 0 &&
    (/@IsTest\b/i.test(code.slice(declared)) || /\btestMethod\b/i.test(code))
  );
}

function testClasses() {
  return files("force-app", [".cls"])
    .filter((file) => hasTestMethods(readFileSync(file, "utf8")))
    .map(baseName)
    .sort();
}

/** Repository classes and triggers whose coverage counts (not test classes or test helpers). */
function codeUnderTest() {
  return files("force-app", [".cls", ".trigger"]).filter(
    (file) =>
      !(
        file.endsWith(".cls") &&
        /@IsTest\b/i.test(withoutComments(readFileSync(file, "utf8")))
      )
  );
}

function sf(sfArgs) {
  try {
    return JSON.parse(
      execFileSync("sf", [...sfArgs, ...orgArgs, "--json"], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: CLASS_TIMEOUT_MS
      })
    );
  } catch (e) {
    if (e.signal) {
      return {
        message: `took longer than ${CLASS_TIMEOUT_MS / 60000} minutes`
      };
    }
    // sf exits non-zero when tests fail; its JSON is still on stdout.
    try {
      return JSON.parse(e.stdout);
    } catch {
      return { message: (e.stderr || e.message || "").trim() };
    }
  }
}

// Class or trigger name -> line number -> covered (true) or not, merged across the runs.
const lines = new Map();

function recordCoverage(result) {
  ((result.coverage && result.coverage.coverage) || []).forEach((entry) => {
    const seen = lines.get(entry.name) || new Map();
    Object.entries(entry.lines || {}).forEach(([line, hits]) => {
      seen.set(line, seen.get(line) === true || hits > 0);
    });
    lines.set(entry.name, seen);
  });
}

function runClass(name) {
  const out = sf([
    "apex",
    "run",
    "test",
    "--synchronous",
    "--class-names",
    name,
    "--code-coverage",
    "--result-format",
    "json"
  ]);
  const result = out.result || {};
  const summary = result.summary;
  if (!summary) {
    return {
      ok: false,
      ran: 0,
      failed: 0,
      line: `could not run: ${out.message || "no result"}`,
      failures: []
    };
  }
  recordCoverage(result);
  const failures = (result.tests || [])
    .filter((t) => t.Outcome !== "Pass")
    .map((t) => `      ${t.MethodName}: ${(t.Message || "").split("\n")[0]}`);
  return {
    ok: summary.outcome === "Passed" && failures.length === 0,
    ran: Number(summary.testsRan) || 0,
    failed: Number(summary.failing) || 0,
    line: `${summary.testsRan} tests, ${summary.failing} failed`,
    failures
  };
}

/**
 * Coverage of the repository's classes and triggers from these runs. One no run touched counts
 * as 0%, with its statements (lines ending in ";") as an estimate of its lines.
 */
function coverage() {
  let covered = 0;
  let total = 0;
  const untouched = [];
  codeUnderTest().forEach((file) => {
    const seen = lines.get(baseName(file));
    if (seen && seen.size > 0) {
      seen.forEach((hit) => {
        covered += hit ? 1 : 0;
        total += 1;
      });
      return;
    }
    const statements = withoutComments(readFileSync(file, "utf8"))
      .split("\n")
      .filter((line) => line.trim().endsWith(";")).length;
    if (statements > 0) {
      untouched.push(baseName(file));
      total += statements;
    }
  });
  return { percent: total === 0 ? 100 : (100 * covered) / total, untouched };
}

const classes = testClasses();
if (classes.length === 0) {
  const anyApex = files("force-app", [".cls"]).length > 0;
  console.log(anyApex ? "No Apex test classes found." : "No Apex yet.");
  process.exit(anyApex ? 1 : 0);
}
console.log(`Running ${classes.length} Apex test classes, one at a time:\n`);
let ran = 0;
let failedTests = 0;
let failedClasses = 0;
classes.forEach((name) => {
  const r = runClass(name);
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${name.padEnd(36)} ${r.line}`);
  r.failures.forEach((f) => console.log(f));
  ran += r.ran;
  failedTests += r.failed;
  failedClasses += r.ok ? 0 : 1;
});

const { percent, untouched } = coverage();
console.log(
  `\nSummary: ${classes.length - failedClasses}/${classes.length} classes passed, ` +
    `${ran} tests ran, ${failedTests} failed.`
);
console.log(
  `Coverage of this repository's Apex: ${percent.toFixed(0)}% (needs ${MIN_COVERAGE}%).`
);
if (untouched.length > 0) {
  console.log(`Not run by any test (counted as 0%): ${untouched.join(", ")}`);
}
if (failedClasses > 0 || percent < MIN_COVERAGE) {
  console.log("\nApex tests FAILED.");
  process.exit(1);
}
console.log("\nApex tests passed.");
