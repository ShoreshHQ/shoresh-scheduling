#!/usr/bin/env node
/**
 * Every Apex class and trigger has its -meta.xml, and every such -meta.xml has its class or
 * trigger. A class without one is left out of every deploy and dry-run without an error, so it is
 * never compiled until someone notices (#55: a test class with a reserved-word error).
 *
 * Usage: node scripts/apex-meta-files.js   (exit 1, listing each one, if any is missing)
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = "force-app";
const APEX = /\.(cls|trigger)$/;
const META = /\.(cls|trigger)-meta\.xml$/;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** { missing: [class or trigger without -meta.xml], orphans: [-meta.xml without its file] }. */
function check(root = ROOT) {
  const files = new Set(
    walk(path.join(root, SOURCE)).map((f) =>
      path.relative(root, f).split(path.sep).join("/")
    )
  );
  const missing = [];
  const orphans = [];
  for (const file of [...files].sort()) {
    if (APEX.test(file) && !files.has(`${file}-meta.xml`)) missing.push(file);
    if (META.test(file) && !files.has(file.replace(/-meta\.xml$/, "")))
      orphans.push(file);
  }
  return { missing, orphans };
}

function main() {
  const { missing, orphans } = check();
  if (missing.length || orphans.length) {
    console.error("Apex metadata check failed.");
    for (const f of missing) console.error(`  no -meta.xml: ${f}`);
    for (const f of orphans)
      console.error(`  -meta.xml with no class or trigger: ${f}`);
    return 1;
  }
  console.log(
    "Apex metadata check passed: every class and trigger has its -meta.xml."
  );
  return 0;
}

module.exports = { check };

if (require.main === module) {
  process.exitCode = main();
}
