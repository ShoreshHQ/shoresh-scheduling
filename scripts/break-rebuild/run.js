#!/usr/bin/env node
/**
 * The break-and-rebuild campaign (wiki projects/shoresh-break-rebuild-2026-11.md). Not run in CI.
 *
 *   node scripts/break-rebuild/run.js            every scenario, each from nothing
 *   node scripts/break-rebuild/run.js S1 B1      only those
 *   --keep leaves the last scenario's camp in the org to look at (cleaned on the next run)
 *
 * Holds the org lock only while a scenario runs, and writes the run to a JSON file it names.
 * Exits 2 if any check failed.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  withOrg,
  classesOffBranch,
  deployBranch,
  call,
  cleanup,
  Record,
  PREFIX
} = require("./lib");

const dir = path.join(__dirname, "scenarios");
const all = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".js"))
  .sort()
  .flatMap((f) => require(path.join(dir, f)));

async function main() {
  const args = process.argv.slice(2);
  const keep = args.includes("--keep");
  const wanted = args.filter((a) => !a.startsWith("--"));
  const chosen = wanted.length ? all.filter((s) => wanted.includes(s.id)) : all;
  const records = [];
  for (const s of chosen) {
    console.log(`\n=== ${s.id}: ${s.title}`);
    const rec = new Record(s.id);
    records.push(rec);
    const started = Date.now();
    await withOrg(async () => {
      // CI from another branch may have changed the org since the last scenario: a failure on
      // someone else's code would mean nothing.
      const off = classesOffBranch();
      const seasons = await call("list_seasons", {});
      if (off.length || /older than your camp|newer than/.test(seasons.text)) {
        console.log(
          `    the org's code isn't this branch's (${off.length} classes): deploying`
        );
        deployBranch();
        const now = await call("list_seasons", {});
        if (/older than your camp/.test(now.text)) {
          throw new Error(
            `The org is ahead of this branch: take in main. ${now.text}`
          );
        }
      }
      cleanup(s.camps ?? `${PREFIX}${s.id} %`);
      try {
        await s.run(rec);
      } catch (e) {
        rec.check("crash", `${s.id} stopped early`, false, e.stack);
      }
      if (!keep) {
        try {
          cleanup(s.camps ?? `${PREFIX}${s.id} %`);
        } catch (e) {
          rec.check("cleanup", `${s.id} left records behind`, false, e.message);
        }
      }
    });
    rec.seconds = Math.round((Date.now() - started) / 1000);
    console.log(`    ${rec.seconds}s`);
  }
  const rows = records.flatMap((r) =>
    r.rows.map((row) => ({ scenario: r.scenario, ...row }))
  );
  const failed = rows.filter((r) => !r.passed);
  const checks = rows.filter((r) => !r.note);
  const out = path.join(os.tmpdir(), `break-rebuild-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify({ records }, null, 1));
  console.log(
    `\n${checks.length - failed.length} of ${checks.length} checks passed, ${failed.length} failed, ${rows.length - checks.length} notes. Full record: ${out}`
  );
  for (const f of failed)
    console.log(`FAIL ${f.scenario} [${f.rule}] ${f.what}`);
  return failed.length ? 2 : 0;
}

main().then(
  (c) => (process.exitCode = c),
  (e) => {
    console.error(e);
    process.exitCode = 1;
  }
);
