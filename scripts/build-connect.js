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

if (require.main === module) {
  for (const f of fs.readdirSync(TO)) {
    if (f.endsWith(".js")) fs.rmSync(path.join(TO, f));
  }
  for (const f of connectorFiles()) {
    fs.copyFileSync(path.join(FROM, f), path.join(TO, f));
  }
  console.log(`Copied ${connectorFiles().length} files into ${TO}`);
}

module.exports = { connectorFiles, FROM, TO, RESOURCE };
