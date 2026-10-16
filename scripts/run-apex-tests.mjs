#!/usr/bin/env node
/**
 * Runs every Apex test class in force-app, one class at a time and directly (synchronously),
 * then prints one line per class, a summary, and the code coverage of the classes and triggers
 * in force-app (not the whole org: the test org is shared, and may hold code from another branch).
 *
 * Why: queued test runs (the usual `sf apex run test --test-level RunLocalTests`) count against
 * the test org's daily allowance of 500 queued test classes. CI and working sessions share one
 * test org, so a busy day used it up and every queued run failed. Direct single-class runs do
 * not count against it. See docs/ci-setup.md.
 *
 * Usage: node scripts/run-apex-tests.mjs [--target-org <alias>]
 * Exits 1 if any class fails or cannot run, or coverage is below 75%.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MIN_COVERAGE = 75;
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

/** Classes with at least one test method (not test-data helpers, which have none). */
function testClasses() {
  const testMethod =
    /@IsTest\s*(\([^)]*\))?\s*(public\s+|private\s+)?static\s+void\s+\w+\s*\(/i;
  return files("force-app", [".cls"])
    .filter((file) => testMethod.test(readFileSync(file, "utf8")))
    .map(baseName)
    .sort();
}

function sf(sfArgs) {
  try {
    return JSON.parse(
      execFileSync("sf", [...sfArgs, ...orgArgs, "--json"], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"]
      })
    );
  } catch (e) {
    // sf exits non-zero when tests fail; its JSON is still on stdout.
    try {
      return JSON.parse(e.stdout);
    } catch {
      return { message: (e.stderr || e.message || "").trim() };
    }
  }
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

/** Lines covered in the repository's own classes and triggers, from the test runs. */
function repositoryCoverage() {
  const ours = new Set(files("force-app", [".cls", ".trigger"]).map(baseName));
  const out = sf([
    "data",
    "query",
    "--use-tooling-api",
    "--query",
    "SELECT ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate"
  ]);
  const rows = ((out.result && out.result.records) || []).filter(
    (row) => row.ApexClassOrTrigger && ours.has(row.ApexClassOrTrigger.Name)
  );
  let covered = 0;
  let total = 0;
  rows.forEach((row) => {
    covered += row.NumLinesCovered || 0;
    total += (row.NumLinesCovered || 0) + (row.NumLinesUncovered || 0);
  });
  return total === 0 ? null : (100 * covered) / total;
}

const classes = testClasses();
if (classes.length === 0) {
  console.log("No Apex test classes yet.");
  process.exit(0);
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

const coverage = repositoryCoverage();
console.log(
  `\nSummary: ${classes.length - failedClasses}/${classes.length} classes passed, ` +
    `${ran} tests ran, ${failedTests} failed.`
);
console.log(
  coverage === null
    ? "Coverage: could not be read."
    : `Coverage of this repository's Apex: ${coverage.toFixed(0)}% (needs ${MIN_COVERAGE}%).`
);
if (failedClasses > 0 || coverage === null || coverage < MIN_COVERAGE) {
  console.log("\nApex tests FAILED.");
  process.exit(1);
}
console.log("\nApex tests passed.");
