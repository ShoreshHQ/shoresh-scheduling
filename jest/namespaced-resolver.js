/**
 * Jest resolver for the namespaced run (jest.namespaced.config.js). It answers every
 * `@salesforce/schema/...` import with the name the package will have once it has its namespace
 * (`Week__c.StartDate__c` -> `shoresh__Week__c` / `shoresh__StartDate__c`), the way Salesforce
 * compiles these imports in a namespaced org. Everything else goes to the usual LWC resolver.
 *
 * Without this, the LWC Jest transformer falls back to the bare name, so a component that spells
 * `record.StartDate__c` and one that uses c/shoreshSchema look the same in tests. With it, the
 * first one reads nothing and its tests fail.
 */
const fs = require("node:fs");
const path = require("node:path");
const lwcResolver = require("@salesforce/sfdx-lwc-jest/src/resolver");

const PREFIX = "shoresh__";
const SCHEMA = "@salesforce/schema/";
const CACHE = path.resolve(
  __dirname,
  "../node_modules/.cache/shoresh-namespaced-schema"
);

/** A custom name (ends in __c or __r) as it is in the namespaced package; standard names stay. */
function namespaced(name) {
  return /__(c|r)$/.test(name) && !name.startsWith(PREFIX)
    ? PREFIX + name
    : name;
}

/** A module file for one schema import, written on first use. */
function schemaModule(resource) {
  // "Week__c.StartDate__c", or a path across lookups: "Week__c.Season__r.Name".
  const [object, ...fieldPath] = resource.split(".");
  const value = { objectApiName: namespaced(object) };
  if (fieldPath.length) {
    value.fieldApiName = fieldPath.map(namespaced).join(".");
  }
  const file = path.join(CACHE, `${resource}.js`);
  const text = `module.exports = { default: ${JSON.stringify(value)} };\n`;
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) {
    // Test workers resolve in parallel: write aside, then rename, so none reads half a file.
    fs.mkdirSync(CACHE, { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, text);
    fs.renameSync(temp, file);
  }
  return file;
}

module.exports = function resolve(request, options) {
  if (request.startsWith(SCHEMA)) {
    return schemaModule(request.slice(SCHEMA.length));
  }
  return lwcResolver(request, options);
};

module.exports.PREFIX = PREFIX;
