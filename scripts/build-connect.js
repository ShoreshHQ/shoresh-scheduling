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
// The one module the connector builds a week with (API-1.19): Generated Schedule's own.
const ENGINE_ENTRY = "shoreshGeneratedWeek/build.js";
const SCHEMA = "engine.salesforce-schema.mjs";

/** A component's module as its flat file name: c/shoreshEngine/week.js -> engine.shoreshEngine.week.mjs */
function flatName(file) {
  return `engine.${file.replace(/\.js$/, "").replace("/", ".")}.mjs`;
}

/**
 * The build engine as the connector runs it in Node (API-1.19): Generated Schedule's own modules
 * (ENGINE_ENTRY and everything it imports), each copied unchanged but for where its imports
 * point, flat beside the connector. Node has no c/<component> or @salesforce/schema, so c/x
 * becomes x's own file, and a field's name comes from SCHEMA (the package's prefix, once it has
 * one, added as Salesforce adds it on a screen). Answers { name: text }.
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
  const todo = [ENGINE_ENTRY];
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

if (require.main === module) {
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
  console.log(
    `Copied ${connectorFiles().length} files and ${Object.keys(engine).length} engine files into ${TO}`
  );
}

module.exports = {
  connectorFiles,
  engineFiles,
  flatName,
  ENGINE_ENTRY,
  FROM,
  TO,
  RESOURCE
};
