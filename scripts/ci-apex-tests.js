#!/usr/bin/env node
/**
 * Picks the Apex test classes a pull request's change can affect (docs/ci-setup.md), so a pull
 * request in the `full` category (scripts/ci-pr-category.js) need not run all of them. Nightly
 * and by-hand runs still run every class.
 *
 * A changed class counts, and so does every class that names it, and every class that names
 * those, and so on (Apex ignores case, so names are compared in lower case). The test classes
 * among them are the ones to run. A screen Apex repeats (MIRRORED_SCREENS) counts as a change to
 * its Apex class. Files that cannot affect Apex (docs, other screens, static resources) are
 * ignored.
 * It says `all` whenever in doubt: a test data builder (*TestData), a trigger, an object or
 * field, a permission set, project or CI files, any other path, an empty file list, or more than
 * MAX_SELECTED test classes.
 *
 * Usage: node scripts/ci-apex-tests.js <base-ref>
 * Prints `apex_tests=<all|none|Class1,Class2,...>` and `apex_reason=<...>` lines (for $GITHUB_OUTPUT).
 * The workflow runs the base branch's copy, as it does ci-pr-category.js, so it must stay
 * self-contained (no require of other repository files).
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const CLASSES_DIR = "force-app/main/default/classes";
const MAX_SELECTED = 40;

// Paths that cannot change what an Apex test does: their own checks cover them.
const NO_APEX_EFFECT = [
  /^docs\//,
  /^\.claude\//,
  /^prototypes\//,
  /^jest\//,
  /^\.vscode\//,
  /^(?!force-app\/|\.github\/)[^/].*\.md$/,
  /^(NOTICE|\.gitignore|\.gitleaksignore|\.prettierrc|\.prettierignore|eslint\.config\.js|code-analyzer\.yml|jest\.config\.js|jest\.namespaced\.config\.js)$/,
  /^force-app\/main\/default\/lwc\//,
  /^force-app\/main\/default\/staticresources\//
];

// The Apex class that repeats each screen's rules (the same list as ci-pr-category.js).
const MIRRORED_SCREENS = {
  shoreshWeekEditor: "AgentCell",
  shoreshCampSetup: "AgentSetupNewRow",
  shoreshProgram: "AgentSetupNewRow",
  shoreshErrors: "AgentVersions"
};

/** Apex source without comments or strings, so a name in either does not count as a use. */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

/** As scripts/run-apex-tests.mjs: an @IsTest after the class is declared, or a testMethod. */
function hasTestMethods(source) {
  const c = code(source);
  const declared = c.search(/\bclass\b/i);
  return (
    declared >= 0 &&
    (/@IsTest\b/i.test(c.slice(declared)) || /\btestMethod\b/i.test(c))
  );
}

/**
 * classes: { Name: source }. Returns { tests, why }: the test classes that reach a changed
 * class, and for each the chain that reached it ("AgentElectivesTest <- AgentElectives").
 */
function affectedTests(changed, classes) {
  const names = Object.keys(classes);
  const byLower = new Map(names.map((n) => [n.toLowerCase(), n]));
  // usedBy: class -> the classes whose code names it.
  const usedBy = new Map(names.map((n) => [n, []]));
  for (const name of names) {
    const words = new Set(code(classes[name]).toLowerCase().match(/\w+/g));
    for (const word of words) {
      const used = byLower.get(word);
      if (used && used !== name) usedBy.get(used).push(name);
    }
  }
  const chain = new Map();
  const queue = [];
  for (const c of changed) {
    const name = byLower.get(c.toLowerCase());
    if (name && !chain.has(name)) {
      chain.set(name, name);
      queue.push(name);
    }
  }
  while (queue.length) {
    const name = queue.shift();
    for (const user of usedBy.get(name)) {
      if (!chain.has(user)) {
        chain.set(user, `${user} <- ${chain.get(name)}`);
        queue.push(user);
      }
    }
  }
  const tests = [...chain.keys()]
    .filter((n) => hasTestMethods(classes[n]))
    .sort();
  return { tests, why: tests.map((t) => chain.get(t)) };
}

/** The decision for a list of changed files. classes: { Name: source } of the pull request. */
function select(files, classes) {
  const all = (reason) => ({ tests: "all", reason, why: [] });
  if (files.length === 0) return all("no changed files found");
  const changed = [];
  for (const file of files) {
    const screen = /^force-app\/main\/default\/lwc\/(\w+)\//.exec(file);
    if (screen && MIRRORED_SCREENS[screen[1]]) {
      changed.push(MIRRORED_SCREENS[screen[1]]);
      continue;
    }
    if (NO_APEX_EFFECT.some((r) => r.test(file))) continue;
    const apex = new RegExp(`^${CLASSES_DIR}/(\\w+)\\.cls(-meta\\.xml)?$`).exec(
      file
    );
    if (!apex) return all(`${file} can affect many tests`);
    if (/TestData$/.test(apex[1])) {
      return all(`${apex[1]} is a test data builder many tests use`);
    }
    changed.push(apex[1]);
  }
  if (changed.length === 0) {
    return { tests: [], reason: "no Apex change", why: [] };
  }
  const { tests, why } = affectedTests(changed, classes);
  if (tests.length > MAX_SELECTED) {
    return all(
      `${tests.length} test classes reach the change (more than ${MAX_SELECTED})`
    );
  }
  return {
    tests,
    reason: `${tests.length} test class${tests.length === 1 ? "" : "es"} reach ${[...new Set(changed)].join(", ")}`,
    why
  };
}

function readClasses() {
  const classes = {};
  for (const file of fs.readdirSync(CLASSES_DIR)) {
    if (file.endsWith(".cls")) {
      classes[file.slice(0, -4)] = fs.readFileSync(
        path.join(CLASSES_DIR, file),
        "utf8"
      );
    }
  }
  return classes;
}

function changedFiles(baseRef) {
  // --no-renames: a moved file shows as a deletion and an addition, so both paths count.
  const out = execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", `origin/${baseRef}...HEAD`],
    { encoding: "utf8" }
  );
  return out.split("\n").filter(Boolean);
}

if (require.main === module) {
  let result;
  try {
    result = select(changedFiles(process.argv[2]), readClasses());
  } catch (e) {
    result = {
      tests: "all",
      reason: `could not work out the tests (${e.message.split("\n")[0]})`,
      why: []
    };
  }
  // The chains go to the log (stderr), the answer to $GITHUB_OUTPUT (stdout).
  result.why.forEach((w) => console.error(`  ${w}`));
  const tests =
    result.tests === "all" ? "all" : result.tests.join(",") || "none";
  console.log(`apex_tests=${tests}`);
  console.log(`apex_reason=${result.reason.replace(/[\r\n]/g, " ")}`);
}

module.exports = { select, affectedTests, hasTestMethods };
