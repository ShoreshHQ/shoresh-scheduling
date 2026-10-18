#!/usr/bin/env node
/**
 * Decides how much of the shared test org a pull request needs (docs/ci-setup.md):
 * - `docs`:   nothing CI deploys or runs against the org changed. The org check passes at once
 *             and never waits in line for the test org.
 * - `screen`: only screens (LWC bundles) or static resources changed. No Apex test can see
 *             those, so the check deploys to prove the source deploys, and runs no Apex tests.
 * - `full`:   anything else (Apex, objects, fields, permission sets, CI, scripts, project
 *             config, or any path not listed below): deploy and every Apex test, as on main.
 * When in doubt it says `full`: an unknown path, an empty file list, or a failed `git diff`.
 *
 * Usage: node scripts/ci-pr-category.js <base-ref>
 * Prints `category=<docs|screen|full>` and `reason=<...>` lines (for $GITHUB_OUTPUT).
 */
const { execFileSync } = require("child_process");

// Paths CI never deploys and the org check never runs. They only affect the
// "LWC Jest and Code Analyzer" check, which always runs.
const NO_ORG_EFFECT = [
  /^docs\//,
  /^\.claude\//,
  /^prototypes\//,
  /^jest\//,
  /^\.vscode\//,
  /^(?!force-app\/|\.github\/)[^/].*\.md$/,
  /^(NOTICE|\.gitignore|\.gitleaksignore|\.prettierrc|\.prettierignore|eslint\.config\.js|code-analyzer\.yml|jest\.config\.js|jest\.namespaced\.config\.js)$/
];

// Metadata no Apex test can read: LWC bundles (their Jest tests live in __tests__, which
// .forceignore keeps out of the deploy) and static resources (no Apex class reads one).
const SCREEN_ONLY = [
  /^force-app\/main\/default\/lwc\//,
  /^force-app\/main\/default\/staticresources\//
];

function categorize(files) {
  if (files.length === 0) {
    return {
      category: "full",
      reason: "no changed files found, so running everything"
    };
  }
  const other = files.filter(
    (f) =>
      !NO_ORG_EFFECT.some((r) => r.test(f)) &&
      !SCREEN_ONLY.some((r) => r.test(f))
  );
  if (other.length > 0) {
    const shown =
      other.slice(0, 5).join(", ") +
      (other.length > 5 ? ` and ${other.length - 5} more` : "");
    return {
      category: "full",
      reason: `changes that can affect Apex tests: ${shown}`
    };
  }
  const screens = files.filter((f) => SCREEN_ONLY.some((r) => r.test(f)));
  if (screens.length > 0) {
    return {
      category: "screen",
      reason: `only screens or static resources changed under force-app (${screens.length} file${screens.length === 1 ? "" : "s"})`
    };
  }
  return {
    category: "docs",
    reason: `only files the test org never sees changed (${files.length} file${files.length === 1 ? "" : "s"})`
  };
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
    result = categorize(changedFiles(process.argv[2]));
  } catch (e) {
    result = {
      category: "full",
      reason: `could not list the changed files (${e.message.split("\n")[0]}), so running everything`
    };
  }
  console.log(`category=${result.category}`);
  console.log(`reason=${result.reason.replace(/[\r\n]/g, " ")}`);
}

module.exports = { categorize };
