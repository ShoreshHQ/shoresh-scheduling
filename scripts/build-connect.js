/**
 * Copies Shoresh's connector (connect/*.js) into the package's ShoreshConnect static resource
 * beside its manifest.json, so it ships and is versioned with the package and each camp
 * gets it from its own Salesforce (API-1.15). Salesforce serves the folder as one zip file, which
 * is also a Claude desktop extension (.mcpb: a zip with manifest.json at its top, API-1.17). Run after changing connect/: node scripts/build-connect.js
 * connect.test.js (shipsInsideThePackage) fails while the two differ.
 */
const fs = require("fs");
const path = require("path");

const FROM = path.resolve(__dirname, "../connect");
const RESOURCE = path.resolve(
  __dirname,
  "../force-app/main/default/staticresources/ShoreshConnect"
);
// Flat, no folders: Claude's extension installer stops at a folder entry in the zip.
const TO = RESOURCE;

/** The connector's own files: every .js in connect/, tests aside. */
function connectorFiles() {
  return fs
    .readdirSync(FROM)
    .filter((f) => f.endsWith(".js"))
    .sort();
}

const LWC = path.resolve(__dirname, "../force-app/main/default/lwc");
// The module the connector builds a week with (API-1.19): Generated Schedule's own.
const ENGINE_ENTRY = "shoreshGeneratedWeek/build.js";
// The modules the connector reads a week's checks with (API-1.30): the ones Generated Schedule's
// counter is worked out with, from the week checked to the lines its dropdown lists.
const CHECKS_ENTRIES = [
  "shoreshGeneratedSchedule/counter.js",
  "shoreshWeekEditor/measure.js",
  // Manual Build's own check of its week (API-1.44).
  "shoreshWeekEditor/manualChecks.js",
  "shoreshWeekChecks/lines.js"
];
// The module the connector lists a week's versions with (API-1.32): the Versions panel's words.
const VERSIONS_ENTRY = "shoreshVersions/words.js";
// The modules the connector edits several cells with (API-1.38): the week editor's own edits, and
// the days a special day replaces (the counter's modules open the week).
const EDITS_ENTRIES = [
  "shoreshWeekEditor/handEdits.js",
  "shoreshWeekEditor/specials.js"
];
// The modules the connector assigns elective seats with (API-1.67): the Elective seats screen's own
// working (from its run to the engine's input and back) and its seat engine.
const ELECTIVES_ENTRIES = [
  "shoreshElectiveSeats/seats.js",
  "shoreshElectiveEngine/shoreshElectiveEngine.js"
];
const SCHEMA = "engine.salesforce-schema.mjs";

/** A component's module as its flat file name: c/shoreshEngine/week.js -> engine.shoreshEngine.week.mjs */
function flatName(file) {
  return `engine.${file.replace(/\.js$/, "").replace("/", ".")}.mjs`;
}

/**
 * The build engine, the week's checks, the Versions list's words and the grid's edits as the
 * connector runs them in Node (API-1.19, API-1.30, API-1.32, API-1.38): the screens' own modules
 * (ENGINE_ENTRY, CHECKS_ENTRIES, VERSIONS_ENTRY, EDITS_ENTRIES and everything they import), each copied
 * unchanged but for where its imports point, flat beside the connector. Node has no
 * c/<component>, @salesforce/schema or @salesforce/apex, so c/x becomes x's own file, a field's
 * name comes from SCHEMA (the package's prefix, once it has one, added as Salesforce adds it on a
 * screen), and a screen's server call, never made here, refuses if it ever were. Answers
 * { name: text }.
 */
function engineFiles() {
  const out = {
    [SCHEMA]: [
      "// What @salesforce/schema gives a screen: the names, with the package's prefix (if any).",
      "export function schemaName(name) {",
      '  const prefix = globalThis.SHORESH_NAMESPACE ? `${globalThis.SHORESH_NAMESPACE}__` : "";',
      '  const [objectApiName, fieldApiName] = name.split(".").map((n) => (/__(c|r)$/.test(n) ? prefix + n : n));',
      "  return fieldApiName ? { objectApiName, fieldApiName } : { objectApiName };",
      "}",
      ""
    ].join("\n")
  };
  const todo = [
    ENGINE_ENTRY,
    ...CHECKS_ENTRIES,
    VERSIONS_ENTRY,
    ...EDITS_ENTRIES,
    ...ELECTIVES_ENTRIES
  ];
  while (todo.length) {
    const file = todo.pop();
    if (out[flatName(file)] !== undefined) continue;
    const dir = path.dirname(file);
    let schema = false;
    let text = fs
      .readFileSync(path.join(LWC, file), "utf8")
      .replace(
        /^import (\w+) from "@salesforce\/schema\/([^"]+)";$/gm,
        (all, name, field) => {
          schema = true;
          return `const ${name} = schemaName(${JSON.stringify(field)});`;
        }
      )
      .replace(
        /^import (\w+) from "@salesforce\/apex\/([^"]+)";$/gm,
        (all, name, method) =>
          `const ${name} = () => Promise.reject(new Error(${JSON.stringify(`${method} runs only on Shoresh's screens.`)}));`
      )
      .replace(
        /^((?:import|export)\b[^\n]* from |\} from |import )"([^"]+)";$/gm,
        (all, lead, spec) => {
          const target = spec.startsWith("c/")
            ? `${spec.slice(2)}/${spec.slice(2)}.js`
            : spec.startsWith("./")
              ? `${dir}/${spec.slice(2)}.js`
              : null;
          if (!target) throw new Error(`${file}: can't run "${spec}" in Node`);
          todo.push(target);
          return `${lead}"./${flatName(target)}";`;
        }
      );
    if (schema) text = `import { schemaName } from "./${SCHEMA}";\n${text}`;
    out[flatName(file)] = text;
  }
  return out;
}

// The week view an AI chat shows (API-1.26): Shoresh's own components compiled for a plain page.
const VIEW = path.join(FROM, "view");
const VIEW_FILE = "week-view.html";

/** Every c/<component> by its own file, as Salesforce finds them, and the view's own wrapper. */
function viewModules() {
  const modules = fs
    .readdirSync(LWC)
    .map((name) =>
      ["js", "css"]
        .map((ext) => path.join(LWC, name, `${name}.${ext}`))
        .find((file) => fs.existsSync(file))
    )
    .filter(Boolean)
    .map((file) => ({
      name: `c/${path.basename(path.dirname(file))}`,
      path: file
    }));
  modules.push({
    name: "shoresh/weekView",
    path: path.join(VIEW, "lwc", "weekView", "weekView.js")
  });
  return modules;
}

/**
 * The week view as one page (API-1.26): the Schedules screen's own grid component
 * (c/shoreshScheduleGrid, its template and styles and the design tokens) and view module
 * (c/shoreshScheduleViews), compiled unchanged by Salesforce's own LWC compiler with the LWC
 * engine, inside view/week.html, which talks to the chat app (MCP Apps).
 */
async function viewFile() {
  const { rollup } = require("rollup");
  const lwc = require("@lwc/rollup-plugin").default;
  const bundle = await rollup({
    input: path.join(VIEW, "entry.js"),
    plugins: [
      lwc({
        rootDir: path.resolve(__dirname, ".."),
        modules: viewModules(),
        disableSyntheticShadowSupport: true
      }),
      // The LWC engine as Salesforce runs it for people: its production build.
      {
        name: "production",
        transform: (code) =>
          code.includes("process.env.NODE_ENV")
            ? code.replace(/process\.env\.NODE_ENV/g, '"production"')
            : null
      }
    ],
    onwarn(warning) {
      throw new Error(`The week view can't be built: ${warning.message}`);
    }
  });
  const { output } = await bundle.generate({ format: "iife", compact: true });
  const code = output[0].code.replace(/<\/(script)/gi, "<\\/$1");
  return fs
    .readFileSync(path.join(VIEW, "week.html"), "utf8")
    .replace("/* SHORESH_VIEW */", () => code);
}

/** What the extension holds besides its manifest, file by file. */
function contents() {
  return fs
    .readdirSync(TO)
    .filter((f) => f !== "manifest.json")
    .sort()
    .map((f) => `${f}\n${fs.readFileSync(path.join(TO, f), "utf8")}`)
    .join("\n");
}

/**
 * A new version whenever what it holds changes, so installing the new .mcpb replaces the copy
 * Claude desktop has (it keeps an installed extension of the same version).
 */
function bumpVersionIfChanged(before) {
  if (contents() === before) return;
  const file = path.join(TO, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const [major, minor, patch] = manifest.version.split(".").map(Number);
  manifest.version = `${major}.${minor}.${patch + 1}`;
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function build() {
  const before = contents();
  for (const f of fs.readdirSync(TO)) {
    if (f.endsWith(".js") || f.endsWith(".mjs")) fs.rmSync(path.join(TO, f));
  }
  for (const f of connectorFiles()) {
    fs.copyFileSync(path.join(FROM, f), path.join(TO, f));
  }
  const engine = engineFiles();
  for (const [f, text] of Object.entries(engine)) {
    fs.writeFileSync(path.join(TO, f), text);
  }
  fs.writeFileSync(path.join(TO, VIEW_FILE), await viewFile());
  bumpVersionIfChanged(before);
  console.log(
    `Copied ${connectorFiles().length} files, ${Object.keys(engine).length} engine files and the week view into ${TO}`
  );
}

if (require.main === module) {
  build().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}

module.exports = {
  connectorFiles,
  engineFiles,
  viewFile,
  VIEW_FILE,
  flatName,
  ENGINE_ENTRY,
  CHECKS_ENTRIES,
  VERSIONS_ENTRY,
  EDITS_ENTRIES,
  ELECTIVES_ENTRIES,
  FROM,
  TO,
  RESOURCE
};
