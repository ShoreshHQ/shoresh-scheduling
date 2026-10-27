#!/usr/bin/env node
/**
 * How well "Import last year" reads the made-up camps (docs/import/corpus.md): every level-1
 * camp through the engine as the screen sends it, with no remembered answers, then the questions
 * it would ask and what it would read wrong, kind by kind. Local only, no org.
 *
 *   npm run score:import                 the full corpus, the summary table
 *   npm run score:import -- --camps      also one line per camp that is not read perfectly
 */
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
const { scoreCamp, summaryTable } = await import("./import-corpus/score.js");

const deps = { engine, XLSX, terms: buildTerms([]) };
const started = Date.now();
const results = ordinaryCamps(CORPUS_SIZE).map((camp) => scoreCamp(camp, deps));

console.log(`Level 1 (ordinary): ${results.length} made-up camps\n`);
console.log(summaryTable(results));
if (process.argv.includes("--camps")) {
  console.log("\nCamps not read perfectly:");
  for (const r of results.filter((x) => !x.perfect)) {
    const shown = (o) =>
      Object.entries(o)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ") || "none";
    console.log(
      `  ${r.camp.id} ${r.camp.layout}/${r.camp.format}/${r.camp.split} ${r.camp.groups.length} groups: asks ${shown(r.questions)}; wrong ${shown(r.wrong)}${r.error ? `; error ${r.error}` : ""}`
    );
  }
}
console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s)`);
