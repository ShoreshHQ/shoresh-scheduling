/**
 * Copies Shoresh's connector (connect/*.js) into the package's ShoreshConnect static resource
 * (server/), beside its manifest.json, so it ships and is versioned with the package and each camp
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
const TO = path.join(RESOURCE, "server");

/** The connector's own files: every .js in connect/, tests aside. */
function connectorFiles() {
  return fs
    .readdirSync(FROM)
    .filter((f) => f.endsWith(".js"))
    .sort();
}

if (require.main === module) {
  fs.rmSync(TO, { recursive: true, force: true });
  fs.mkdirSync(TO, { recursive: true });
  for (const f of connectorFiles()) {
    fs.copyFileSync(path.join(FROM, f), path.join(TO, f));
  }
  console.log(`Copied ${connectorFiles().length} files into ${TO}`);
}

module.exports = { connectorFiles, FROM, TO, RESOURCE };
