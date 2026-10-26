#!/usr/bin/env node
/**
 * How long Generate takes in a real browser (headless Chromium) against Node, on the biggest
 * and slowest camps the engine is tested with (docs/engine/protocol.md, "How long a build may
 * run"). Local only, no org: the engine's plain modules are served to the page from this
 * checkout, and the week is built with Generated Schedule's own pieces.js (about 30 ms of work,
 * then the browser's turn), as the screen builds it.
 *
 *   npm run time:engine:browser             every camp below, Node then Chromium
 *   npm run time:engine:browser -- --quick  only the camps under a few seconds
 *
 * For each camp: wall time in Node (generateWeek at once) and in Chromium (buildInPieces), their
 * ratio, the longest the page's main thread was held between turns (Chromium's long tasks), and
 * the work the run did (ruleChecks, the same on any machine, so the two runs are the same week).
 * Needs Google Chrome or Playwright's Chromium (npx playwright-core install chromium).
 */
import { registerHooks } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const LWC = join(ROOT, "force-app/main/default/lwc");
const TESTS = join(LWC, "shoreshEngine/__tests__");

/**
 * What @salesforce/schema/<Object>.<Field> gives a component (as Jest's transformer gives it):
 * the names, which is all the engine reads.
 */
function schemaModule(name) {
  const [objectApiName, fieldApiName] = name.split(".");
  const value = fieldApiName
    ? { objectApiName, fieldApiName }
    : { objectApiName };
  return `export default ${JSON.stringify(value)};`;
}

// Node: the same names Jest maps (c/<module>, shoresh-jest/<file>, @salesforce/schema), and
// extensionless imports.
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
    const j = /^shoresh-jest\/(.+)$/.exec(specifier);
    if (j) {
      return next(
        pathToFileURL(join(ROOT, "jest", `${j[1]}.js`)).href,
        context
      );
    }
    if (/^\.\.?\//.test(specifier) && !/\.\w+$/.test(specifier)) {
      return next(`${specifier}.js`, context);
    }
    return next(specifier, context);
  }
});

const { generateWeek } = await import("c/shoreshEngine");
const { activity, block, camp, group } = await import(
  pathToFileURL(join(TESTS, "data/camp.js")).href
);
const { ODD_CAMPS, inputOf } = await import(
  pathToFileURL(join(TESTS, "data/oddCamps.js")).href
);
const { sharedCamp } = await import(
  pathToFileURL(join(TESTS, "data/sharedCamp.js")).href
);

const QUICK = process.argv.includes("--quick");
const CEILING_MS = 3 * 60 * 1000;

/**
 * A made-up week that can't fit (protocol.md's 60 x 8, 80 groups, 100 x 10): every activity
 * owed `min` times a week, one in three two blocks long, more than the week holds. Synthetic.
 */
function cantFit({ groups, blocks, activities, min, atOnce }) {
  return camp({
    groups: Array.from({ length: groups }, (_, i) =>
      group(`g${String(i).padStart(3, "0")}`, { division: `div${i % 6}` })
    ),
    days: 5,
    blocks: Array.from({ length: blocks }, (_, i) => block(i)),
    locations: [
      { id: "pool", fit: 2 },
      { id: "field", fit: 4 }
    ],
    activities: Array.from({ length: activities }, (_, i) =>
      activity(`a${i}`, {
        min,
        max: min,
        atOnce,
        span: i % 3 === 2 ? 2 : 1,
        location: i === 0 ? "pool" : i === 1 ? "field" : null,
        priority: i % 2 ? "Low" : "High"
      })
    ),
    fixed: [{ id: "lunch", name: "Lunch", block: "b4" }]
  });
}

const size = (c) => c.spec.groups.length * c.spec.blocks.length;
const largestOdd = ODD_CAMPS.filter((c) => !c.small)
  .sort((a, b) => size(b) - size(a))
  .slice(0, 3);

const CASES = [
  ...largestOdd.map((c) => ({
    name: `odd: ${c.name}`,
    input: inputOf(c),
    quick: true
  })),
  ...[143, 241].map((seed) => ({
    name: `differential seed ${seed}`,
    input: camp(sharedCamp(seed))
  })),
  {
    name: "can't fit: 60 groups x 8 blocks",
    input: cantFit({ groups: 60, blocks: 8, activities: 10, min: 4, atOnce: 2 })
  },
  {
    name: "can't fit: 80 groups x 8 blocks",
    input: cantFit({ groups: 80, blocks: 8, activities: 15, min: 3, atOnce: 2 })
  },
  {
    name: "can't fit: 100 groups x 10 blocks",
    input: cantFit({
      groups: 100,
      blocks: 10,
      activities: 20,
      min: 3,
      atOnce: 2
    })
  }
].filter((c) => !QUICK || c.quick);

// What the page gets is what the screen gets: plain data (Apex's JSON), no shared objects.
for (const c of CASES) {
  c.input = JSON.parse(JSON.stringify(c.input));
}

/** Node: the whole week at once, as the engine's tests build it. */
function inNode(input) {
  const started = performance.now();
  const result = generateWeek(structuredClone(input));
  return { ms: performance.now() - started, ruleChecks: result.ruleChecks };
}

/** Every lwc module the engine (and pieces.js) may import, for the page's import map. */
function importMap() {
  const imports = {};
  for (const name of readdirSync(LWC)) {
    if (existsSync(join(LWC, name, `${name}.js`))) {
      imports[`c/${name}`] = `/lwc/${name}/${name}.js`;
    }
  }
  imports["@salesforce/schema/"] = "/schema/";
  return { imports };
}

const ORIGIN = "http://engine-timing.test";
const PAGE = `<!doctype html><meta charset="utf-8"><title>Engine timing</title>
<script type="importmap">${JSON.stringify(importMap())}</script>
<script type="module">
  import { buildInPieces } from "/lwc/shoreshGeneratedSchedule/pieces.js";
  window.timeBuild = async (input) => {
    const blocks = [];
    const seen = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) blocks.push(e.duration);
    });
    seen.observe({ type: "longtask", buffered: false });
    let pieces = 0;
    const started = performance.now();
    const result = await buildInPieces(input, () => pieces++);
    const ms = performance.now() - started;
    // Long tasks are reported after the task ends: one more turn so the last is in.
    await new Promise((r) => setTimeout(r, 50));
    seen.disconnect();
    return {
      ms,
      pieces: pieces + 1,
      longestBlock: blocks.length ? Math.max(...blocks) : 0,
      ruleChecks: result.ruleChecks
    };
  };
  window.ready = true;
</script>`;

async function launch() {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright-core");
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function main() {
  const browser = await launch();
  const page = await browser.newPage();
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") {
      return route.fulfill({ contentType: "text/html", body: PAGE });
    }
    if (path.startsWith("/schema/")) {
      return route.fulfill({
        contentType: "text/javascript",
        body: schemaModule(decodeURIComponent(path.slice("/schema/".length)))
      });
    }
    const file = join(ROOT, "force-app/main/default", path);
    const withJs = existsSync(file) ? file : `${file}.js`;
    if (!path.startsWith("/lwc/") || !existsSync(withJs)) {
      return route.fulfill({ status: 404, body: "" });
    }
    return route.fulfill({
      contentType: "text/javascript",
      body: readFileSync(withJs, "utf8")
    });
  });
  page.on("pageerror", (e) => console.error("page:", e.message));
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.ready === true);
  const version = browser.version();
  console.log(`Node ${process.version}, Chromium ${version}\n`);

  const rows = [];
  for (const c of CASES) {
    const node = inNode(c.input);
    const web = await page.evaluate(
      (input) => window.timeBuild(input),
      c.input
    );
    const row = {
      camp: c.name,
      nodeS: +(node.ms / 1000).toFixed(1),
      chromiumS: +(web.ms / 1000).toFixed(1),
      ratio: +(web.ms / node.ms).toFixed(2),
      longestBlockMs: Math.round(web.longestBlock),
      pieces: web.pieces,
      ruleChecks: web.ruleChecks,
      sameWork: web.ruleChecks === node.ruleChecks,
      under3min: web.ms < CEILING_MS
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  await browser.close();

  console.log(
    "\n| Camp | Node | Chromium | Chromium / Node | Longest block | Same work |"
  );
  console.log("| --- | --: | --: | --: | --: | --- |");
  for (const r of rows) {
    console.log(
      `| ${r.camp} | ${r.nodeS} s | ${r.chromiumS} s | ${r.ratio} | ${r.longestBlockMs} ms | ${r.sameWork ? "yes" : "NO"} |`
    );
  }
  const worst = Math.max(...rows.map((r) => r.chromiumS));
  console.log(
    `\nSlowest in Chromium: ${worst} s, ${worst * 1000 < CEILING_MS ? "under" : "OVER"} the 3-minute ceiling.`
  );
  if (rows.some((r) => !r.sameWork || !r.under3min)) {
    process.exitCode = 1;
  }
}

await main();
