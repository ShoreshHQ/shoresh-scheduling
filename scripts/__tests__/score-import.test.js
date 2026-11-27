// `npm run score:import` runs the engine in Node, outside Jest, with the module names Jest maps
// given by hand (scripts/import-corpus-score.mjs). It stopped at the first one it lacked
// (@salesforce/i18n, from c/shoreshCampClock): this runs it, so the next one is caught here.
const { execFileSync } = require("child_process");
const path = require("path");

it("npm run score:import scores the made-up camps", () => {
  const out = execFileSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      path.join(__dirname, "..", "import-corpus-score.mjs")
    ],
    { encoding: "utf8", timeout: 120000 }
  );
  expect(out).toContain("Greg's camp (plant-camp.xlsx):");
});
