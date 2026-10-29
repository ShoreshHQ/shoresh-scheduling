#!/usr/bin/env node
/**
 * How well "Import last year" reads the made-up camps (docs/import/corpus.md): every level-1
 * camp through the engine as the screen sends it, with no remembered answers, then the questions
 * it would ask and what it would read wrong, kind by kind. Local only, no org.
 *
 *   npm run score:import                 the full corpus, the summary table
 *   npm run score:import -- --camps      also one line per camp that is not read perfectly
 *   npm run score:import -- --level 2    level 2: schedules that differ from week to week
 *   npm run score:import -- --level 3    level 3: hard (doubles, trips, half days, gaps, slips, notes)
 *   npm run score:import -- --level 4    level 4: very hard (programs, evenings, weekends, weeks, specials)
 *   npm run score:import -- --level 5    level 5: really weird (transposed, codes, Hebrew, 1 or 150 groups...)
 *
 * Level 1 also scores the "divisions travel together" camps (scripts/import-corpus/travel.js), and
 * Greg's camp (scripts/import-corpus/fixtures/plant-camp.xlsx) on its own line.
 */
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const LWC = join(ROOT, "force-app/main/default/lwc");

/** What @salesforce/schema/<Object>.<Field> gives a component: the names, all the engine reads. */
function schemaModule(name) {
  const [objectApiName, fieldApiName] = name.split(".");
  const value = fieldApiName
    ? { objectApiName, fieldApiName }
    : { objectApiName };
  return `export default ${JSON.stringify(value)};`;
}

// Node: the names Jest maps (c/<module>, @salesforce/schema), and extensionless imports.
registerHooks({
  resolve(specifier, context, next) {
    const schema = /^@salesforce\/schema\/(.+)$/.exec(specifier);
    if (schema) {
      return {
        url: `data:text/javascript,${encodeURIComponent(schemaModule(schema[1]))}`,
        shortCircuit: true
      };
    }
    const c = /^c\/(\w+)$/.exec(specifier);
    if (c) {
      return next(pathToFileURL(join(LWC, c[1], `${c[1]}.js`)).href, context);
    }
    if (/^\.\.?\//.test(specifier) && !/\.\w+$/.test(specifier)) {
      return next(`${specifier}.js`, context);
    }
    return next(specifier, context);
  }
});

const engine = await import("c/shoreshImportEngine");
const { buildTerms } = await import("c/shoreshTerms");
const XLSX = await import("xlsx");
const { CORPUS_SIZE, ordinaryCamps } = await import("./import-corpus/camps.js");
const { LEVEL2_SIZE, variedCamps } = await import("./import-corpus/level2.js");
const { TRAVEL_SIZE, travellingCamps } =
  await import("./import-corpus/travel.js");
const { headingReport, plantCamp } =
  await import("./import-corpus/plant-camp.js");
const { LEVEL3_SIZE, hardCamps } = await import("./import-corpus/level3.js");
const { DECISIONS_SIZE, LEVEL4_SIZE, decisionCamps, veryHardCamps } =
  await import("./import-corpus/level4.js");
const {
  DECISIONS5_SIZE,
  LEVEL5_SIZE,
  decisionCamps5,
  scoreWeirdCamp,
  weirdCamps,
  weirdTable
} = await import("./import-corpus/level5.js");
const { scoreCamp, summaryTable, traitTable, weekTable } =
  await import("./import-corpus/score.js");

const deps = { engine, XLSX, terms: buildTerms([]) };
const started = Date.now();
const levelAt = process.argv.indexOf("--level");
const level = levelAt > 0 ? Number(process.argv[levelAt + 1]) : 1;

const shown = (o) =>
  Object.entries(o)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ") || "none";

if (level === 4) {
  const results = veryHardCamps(LEVEL4_SIZE).map((camp) =>
    scoreCamp(camp, deps)
  );
  console.log(`Level 4 (very hard): ${results.length} made-up camps\n`);
  console.log(summaryTable(results));
  console.log(`\nBy trait:\n${traitTable(results)}`);
  printCamps(results);
  const decided = decisionCamps(DECISIONS_SIZE).map((camp) =>
    scoreCamp(camp, deps)
  );
  console.log(
    `\nLevel 4, Greg's decisions (a special day in a camp of two programs): ${decided.length} made-up camps\n`
  );
  console.log(summaryTable(decided));
  printCamps(decided);
} else if (level === 5) {
  const results = weirdCamps(LEVEL5_SIZE).map((camp) =>
    scoreWeirdCamp(camp, deps, scoreCamp)
  );
  console.log(`Level 5 (really weird): ${results.length} made-up camps\n`);
  console.log(summaryTable(results));
  console.log(`\nBy trait:\n${weirdTable(results)}`);
  printCamps(results);
  const decided = decisionCamps5(DECISIONS5_SIZE).map((camp) =>
    scoreWeirdCamp(camp, deps, scoreCamp)
  );
  console.log(
    `\nLevel 5, Greg's decisions (emoji, an activity's place in brackets): ${decided.length} made-up camps\n`
  );
  console.log(summaryTable(decided));
  console.log(`\nBy trait:\n${weirdTable(decided)}`);
  printCamps(decided);
} else if (level === 3) {
  const results = hardCamps(LEVEL3_SIZE).map((camp) => scoreCamp(camp, deps));
  console.log(`Level 3 (hard): ${results.length} made-up camps\n`);
  console.log(summaryTable(results));
  console.log(`\nBy trait:\n${traitTable(results)}`);
  printCamps(results);
} else if (level === 2) {
  const results = variedCamps(LEVEL2_SIZE).map((camp) => scoreCamp(camp, deps));
  console.log(
    `Level 2 (schedules that differ week to week): ${results.length} made-up camps\n`
  );
  console.log(summaryTable(results));
  console.log(`\nWeeks:\n${weekTable(results)}`);
  printCamps(results);
} else {
  const results = ordinaryCamps(CORPUS_SIZE).map((camp) =>
    scoreCamp(camp, deps)
  );
  console.log(`Level 1 (ordinary): ${results.length} made-up camps\n`);
  console.log(summaryTable(results));
  printCamps(results);
  const travel = travellingCamps(TRAVEL_SIZE).map((camp) =>
    scoreCamp(camp, deps)
  );
  console.log(
    `\nLevel 1, divisions travel together: ${travel.length} made-up camps\n`
  );
  console.log(summaryTable(travel));
  printCamps(travel);
  const bytes = readFileSync(
    join(ROOT, "scripts/import-corpus/fixtures/plant-camp.xlsx")
  );
  const camp = plantCamp(bytes);
  const r = scoreCamp(camp, { ...deps, keepProposal: true });
  console.log(
    `\n${camp.name}: ${r.perfect ? "perfect" : "not perfect"}${r.error ? `; error ${r.error}` : ""}`
  );
  console.log(`  asks: ${shown(r.questions)}\n  wrong: ${shown(r.wrong)}`);
  if (!r.error) {
    const h = headingReport(camp, r);
    console.log(
      `  headings used as group names: ${h.headingAsGroup} of ${camp.headings.length}; headings read as data: ${h.headingAsData.join(", ") || "none"}`
    );
    console.log(
      `  days found: ${h.daysFound.join(", ") || "none"}; earliest block: ${h.firstBlock}; cells shifted a row: ${h.shifted}`
    );
  }
}

function printCamps(results) {
  if (!process.argv.includes("--camps")) return;
  console.log("\nCamps not read perfectly:");
  for (const r of results.filter((x) => !x.perfect)) {
    console.log(
      `  ${r.camp.id} ${r.camp.layout}/${r.camp.format}/${r.camp.split} ${(r.camp.variations || []).join("+")}: asks ${shown(r.questions)}; wrong ${shown(r.wrong)}${r.error ? `; error ${r.error}` : ""}`
    );
  }
}
console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s)`);
