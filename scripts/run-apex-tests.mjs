#!/usr/bin/env node
/**
 * Runs every Apex test class in force-app, one class at a time and directly (synchronously),
 * then prints one line per class (with its seconds), a summary, and the code coverage of the
 * classes and triggers in force-app, read from the org's running totals after the last class.
 * It starts the Salesforce CLI once, for its login, and runs each class through the same
 * Tooling API call `sf apex run test --synchronous --code-coverage` makes: starting the CLI and
 * reading coverage for every class cost about as much as the quickest classes take to run.
 *
 * Why: queued test runs (the usual `sf apex run test --test-level RunLocalTests`) count against
 * the test org's daily allowance of 500 queued test classes. CI and working sessions share one
 * test org, so a busy day used it up and every queued run failed. Direct single-class runs do
 * not count against it. See docs/ci-setup.md.
 *
 * Usage: node scripts/run-apex-tests.mjs [--target-org <alias>]
 * Exits 1 if no test class is found, any class fails, cannot run, or takes longer than 10
 * minutes, or coverage is below 75%. While the shared org is busy (another run or deploy), a
 * class waits and tries again, for up to 3 minutes.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MIN_COVERAGE = 75;
const CLASS_TIMEOUT_MS = 10 * 60 * 1000;
const CLI_TIMEOUT_MS = 2 * 60 * 1000;
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

/** Runs the Salesforce CLI and returns its JSON output (or what went wrong). */
function sf(sfArgs) {
  try {
    return JSON.parse(
      execFileSync("sf", [...sfArgs, ...orgArgs, "--json"], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: CLI_TIMEOUT_MS
      })
    );
  } catch (e) {
    if (e.signal) {
      return { message: `took longer than ${CLI_TIMEOUT_MS / 60000} minutes` };
    }
    try {
      return JSON.parse(e.stdout);
    } catch {
      return { message: (e.stderr || e.message || "").trim() };
    }
  }
}

/**
 * A session with the org, from the CLI's own login (two CLI starts for the whole run; starting
 * the CLI for every class cost seconds each). The token is held in memory only, never printed.
 */
const session = {};
function connect() {
  const org = sf(["org", "display"]).result || {};
  const token = sf(["org", "auth", "show-access-token"]);
  const accessToken = token.result && token.result.accessToken;
  if (!org.instanceUrl || !accessToken) {
    console.log(`Could not reach the test org: ${token.message || "no login"}`);
    process.exit(1);
  }
  session.instanceUrl = org.instanceUrl;
  session.accessToken = accessToken;
  session.apiVersion =
    org.apiVersion ||
    JSON.parse(readFileSync("sfdx-project.json", "utf8")).sourceApiVersion;
}

/**
 * Calls the org's Tooling API. Returns { ok, body } (body parsed from JSON when it is JSON).
 * Logs in again once if the session has expired.
 */
async function tooling(path, init = {}, retried = false) {
  const url = `${session.instanceUrl}/services/data/v${session.apiVersion}/tooling/${path}`;
  let response;
  let text;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(CLASS_TIMEOUT_MS)
    });
    text = await response.text();
  } catch (e) {
    const timedOut = e.name === "TimeoutError";
    return {
      ok: false,
      body: {
        message: timedOut
          ? `took longer than ${CLASS_TIMEOUT_MS / 60000} minutes`
          : e.message
      }
    };
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { message: text.trim() };
  }
  if (response.status === 401 && !retried) {
    connect();
    return tooling(path, init, true);
  }
  if (!response.ok) {
    // Errors come back as [{ errorCode, message }].
    const error = Array.isArray(body) ? body[0] || {} : body;
    body = {
      name: error.errorCode || `HTTP ${response.status}`,
      message: `${error.errorCode ? `${error.errorCode}: ` : ""}${error.message || text.trim()}`
    };
  }
  return { ok: response.ok, body };
}

const BUSY_RETRIES = 6;
const BUSY_WAIT_MS = 30 * 1000;

/** The org is busy with another test run or deploy (shared org): worth waiting for. */
function orgBusy(out) {
  return (
    !out.ok &&
    /ORG_ADMIN_LOCKED|admin operation already in progress/i.test(
      `${out.body.name || ""} ${out.body.message || ""}`
    )
  );
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs one class, waiting (up to 3 minutes) while the shared org is busy. */
async function runClass(name) {
  let out = await runOnce(name);
  for (let attempt = 1; attempt <= BUSY_RETRIES && orgBusy(out); attempt++) {
    console.log(`      (test org busy; trying ${name} again in 30 seconds)`);
    await pause(BUSY_WAIT_MS);
    out = await runOnce(name);
  }
  return summarize(out);
}

/**
 * One class, run directly (synchronously), as `sf apex run test --synchronous --class-names
 * <name> --code-coverage` does it. Direct runs don't count against the queued-run allowance.
 */
function runOnce(name) {
  return tooling("runTestsSynchronous/", {
    method: "POST",
    body: JSON.stringify({
      tests: [{ className: name }],
      testLevel: "RunSpecifiedTests",
      skipCodeCoverage: false
    })
  });
}

// The test classes that ran (their ids), for reading coverage at the end.
const testClassIds = new Set();

function summarize(out) {
  const result = out.body;
  if (!out.ok || typeof result.numTestsRun !== "number") {
    return {
      ok: false,
      ran: 0,
      failed: 0,
      line: `could not run: ${result.message || "no result"}`,
      failures: []
    };
  }
  if (result.numTestsRun === 0) {
    // A class the org found no tests in (renamed, or its tests did not compile) is not a pass.
    return {
      ok: false,
      ran: 0,
      failed: 0,
      line: "no tests ran",
      failures: []
    };
  }
  [...(result.successes || []), ...(result.failures || [])].forEach(
    (t) => t.id && testClassIds.add(t.id)
  );
  const failed = (result.failures || []).length;
  const failures = (result.failures || []).map(
    (t) => `      ${t.methodName}: ${(t.message || "").split("\n")[0]}`
  );
  return {
    ok: failed === 0 && Number(result.numFailures || 0) === 0,
    ran: result.numTestsRun,
    failed,
    line: `${result.numTestsRun} tests, ${failed} failed`,
    failures
  };
}

/** Every record a Tooling API query returns, following its pages. */
async function queryAll(soql) {
  const records = [];
  let next = `query/?q=${encodeURIComponent(soql)}`;
  while (next) {
    const out = await tooling(next);
    if (!out.ok) {
      console.log(
        `Could not read coverage: ${out.body.message}\n(A deploy to the test org while this run was going can cause this; run it again.)`
      );
      process.exit(1);
    }
    records.push(...(out.body.records || []));
    next = out.body.done
      ? null
      : out.body.nextRecordsUrl.replace(/^.*\/tooling\//, "");
  }
  return records;
}

/**
 * Class or trigger name -> line number -> covered (true) or not, read once after every class
 * has run, as the CLI read it after each class: the org's running totals
 * (ApexCodeCoverageAggregate) for the classes and triggers this run's tests touched, so a class
 * only an old or deleted test covered still counts as not run.
 */
async function readCoverage(testClassIds) {
  const touched = new Set();
  const ids = [...testClassIds];
  for (let i = 0; i < ids.length; i += 50) {
    const list = ids
      .slice(i, i + 50)
      .map((id) => `'${id}'`)
      .join(",");
    (
      await queryAll(
        `SELECT ApexClassOrTriggerId FROM ApexCodeCoverage WHERE ApexTestClassId IN (${list})`
      )
    ).forEach((record) => touched.add(record.ApexClassOrTriggerId));
  }
  const lines = new Map();
  (
    await queryAll(
      "SELECT ApexClassOrTriggerId, ApexClassOrTrigger.Name, Coverage FROM ApexCodeCoverageAggregate"
    )
  ).forEach((record) => {
    const name = record.ApexClassOrTrigger && record.ApexClassOrTrigger.Name;
    // With no per-test rows (the org stores only aggregate coverage) take every aggregate row,
    // as the CLI does.
    if (
      !name ||
      (touched.size > 0 && !touched.has(record.ApexClassOrTriggerId))
    ) {
      return;
    }
    const seen = new Map();
    ((record.Coverage && record.Coverage.coveredLines) || []).forEach((line) =>
      seen.set(String(line), true)
    );
    ((record.Coverage && record.Coverage.uncoveredLines) || []).forEach(
      (line) => seen.set(String(line), seen.get(String(line)) === true)
    );
    lines.set(name, seen);
  });
  return lines;
}

/**
 * Coverage of the repository's classes and triggers from these runs. One no run touched counts
 * as 0%, with its statements (lines ending in ";") as an estimate of its lines.
 */
function coverage(lines) {
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
connect();
console.log(`Running ${classes.length} Apex test classes, one at a time:\n`);
let ran = 0;
let failedTests = 0;
let failedClasses = 0;
for (const name of classes) {
  const started = Date.now();
  const r = await runClass(name);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `${r.ok ? "PASS" : "FAIL"}  ${name.padEnd(36)} ${r.line.padEnd(22)} ${seconds.padStart(6)} s`
  );
  r.failures.forEach((f) => console.log(f));
  ran += r.ran;
  failedTests += r.failed;
  failedClasses += r.ok ? 0 : 1;
}

const { percent, untouched } = coverage(await readCoverage(testClassIds));
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
