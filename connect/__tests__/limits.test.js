/**
 * A file sent by an AI tool or the command line is held to the screens' limits (docs/import/files.md,
 * INGEST-1.4): over one, it is refused in the screens' words and nothing is imported. No Salesforce
 * here: the sf command line is a stand-in, and the data is made up.
 */
const fs = require("fs");
const path = require("path");
const { fileOf } = require("../imports");
const { call: callAs, importModules } = require("../client");

const LWC = path.resolve(__dirname, "../../force-app/main/default/lwc");
const engine = require(`${LWC}/shoreshImportEngine/shoreshImportEngine.js`);
const call = (name, input, options) =>
  callAs(name, input, {
    camp: async () => ({ namespace: "", version: null }),
    ...options
  });

const TOO_LARGE =
  "That file is too large to import (over 10 MB). Nothing was imported.";
const TOO_MANY_SHEETS =
  "That file has too many sheets (over 256) to import safely. Nothing was imported.";
const TOO_MANY_ROWS =
  "A sheet in that file has too many rows (over 20000) to import safely. Nothing was imported.";

const bigCsv = "Activity\n" + "Archery,".repeat(1.4 * 1024 * 1024);
const sheets = (count, rows = 1) =>
  Array.from({ length: count }, (_, i) => ({
    name: `Sheet${i + 1}`,
    rows: Array.from({ length: rows }, () => ["Archery"])
  }));

// INGEST-1.4
describe("a file an AI sends", () => {
  it("over 10 MB of CSV text is refused", () => {
    expect(fileOf({ file_name: "big.csv", csv_text: bigCsv }, engine)).toEqual({
      problem: TOO_LARGE
    });
  });

  it("of more than 256 sheets is refused; 256 is read", () => {
    expect(
      fileOf({ file_name: "many.xlsx", sheets: sheets(257) }, engine)
    ).toEqual({ problem: TOO_MANY_SHEETS });
    expect(
      fileOf({ file_name: "ok.xlsx", sheets: sheets(256) }, engine).file.sheets
    ).toHaveLength(256);
  });

  it("with a sheet of more than 20,000 rows is refused, as rows or as CSV", () => {
    expect(
      fileOf({ file_name: "long.xlsx", sheets: sheets(1, 20001) }, engine)
    ).toEqual({ problem: TOO_MANY_ROWS });
    expect(
      fileOf(
        { file_name: "long.csv", csv_text: "Archery\n".repeat(20001) },
        engine
      )
    ).toEqual({ problem: TOO_MANY_ROWS });
  });

  it("is read through fileOf by every action that takes a file", () => {
    // Only fileOf turns what an AI sends into a file; each file action calls it.
    for (const module of ["imports", "lastYear", "choices", "specialFile"]) {
      expect(
        fs.readFileSync(path.join(__dirname, `../${module}.js`), "utf8")
      ).toMatch(/fileOf\(/);
    }
    const others = fs
      .readdirSync(path.join(__dirname, ".."))
      .filter((f) => f.endsWith(".js") && f !== "imports.js");
    for (const f of others) {
      const text = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
      expect([f, /csvFile\(|input\.sheets\b/.test(text)]).toEqual([f, false]);
    }
  });
});

// INGEST-1.4
describe("import_list and import_last_year with a file over a limit", () => {
  const imports = async () =>
    importModules({
      engine,
      lists: require(`${LWC}/shoreshLists/shoreshLists.js`),
      table: require(`${LWC}/shoreshListImport/table.js`),
      terms: require(`${LWC}/shoreshTerms/shoreshTerms.js`),
      screens: require(`${LWC}/shoreshScreens/shoreshScreens.js`),
      remembered: require(`${LWC}/shoreshRemembered/shoreshRemembered.js`),
      patterns: require(`${LWC}/shoreshPatterns/shoreshPatterns.js`),
      choices: require(`${LWC}/shoreshChoicesReader/shoreshChoicesReader.js`),
      flow: require(`${LWC}/shoreshImport/flow.js`),
      summary: require(`${LWC}/shoreshImport/summary.js`),
      fromFile: require(`${LWC}/shoreshSpecialSchedule/fromFile.js`)
    });
  const setup = {
    season: { Id: "a00000000000001AAA", Name: "Summer 2026" },
    weeks: [],
    weekExceptions: [],
    locationTypes: [],
    locations: [],
    activities: [],
    programs: [],
    schedules: [],
    labels: []
  };
  const read = JSON.stringify({
    season: "Summer 2026",
    setup,
    answers: [],
    seen: "s1"
  });
  const send = async (name, input) => {
    const sent = [];
    const done = await call(name, input, {
      run: async (args, stdin) => {
        sent.push({ args, stdin });
        return `HTTP/1.1 200\n\n${read}`;
      },
      imports
    });
    return { done, sent };
  };

  it("is refused in the screens' words, and nothing is sent to be saved", async () => {
    const list = await send("import_list", {
      season: "Summer 2026",
      list: "activities",
      file_name: "big.csv",
      csv_text: bigCsv,
      save: true,
      seen: "s1"
    });
    expect(list.done).toMatchObject({ ok: false, text: TOO_LARGE });
    expect(list.sent).toHaveLength(1);

    const lastYear = await send("import_last_year", {
      season: "Summer 2026",
      files: [{ file_name: "many.xlsx", sheets: sheets(257) }],
      save: true,
      seen: "s1"
    });
    expect(lastYear.done).toMatchObject({ ok: false, text: TOO_MANY_SHEETS });
    expect(lastYear.sent).toHaveLength(1);
  });
});
