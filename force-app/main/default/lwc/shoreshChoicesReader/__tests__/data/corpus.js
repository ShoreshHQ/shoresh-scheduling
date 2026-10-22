// The synthetic choices sheets (docs/samples/choices, made by scripts/make-choices-samples.mjs)
// read the way the screen will read them: file bytes through c/shoreshImportEngine's csvFile and
// workbookFile. Not a test itself. Everything in the corpus is invented.
import { readFileSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";
import { csvFile, workbookFile } from "c/shoreshImportEngine";

/**
 * The corpus, found from the tests folder of the test file that asks (as
 * shoreshImportEngine's samples.js does): { manifest, names, sheetFile(name) }.
 */
export function corpusFrom(testsFolder) {
  const folder = join(
    testsFolder,
    "..",
    "..",
    "..",
    "..",
    "..",
    "..",
    "docs",
    "samples",
    "choices"
  );
  const json = (name) => JSON.parse(readFileSync(join(folder, name), "utf8"));
  return {
    manifest: json("manifest.json"),
    names: json("names.json"),
    sheetFile(name) {
      const path = join(folder, name);
      return name.endsWith(".csv")
        ? csvFile(name, readFileSync(path, "utf8"))
        : workbookFile(XLSX, name, readFileSync(path));
    }
  };
}

// ---------- the parts of a reading the corpus states ----------

const place = ({ kind, sheet, row, column }) => {
  const out = { kind, sheet };
  if (row !== null && row !== undefined) out.row = row;
  if (column !== null && column !== undefined) out.column = column;
  return out;
};
const byPlace = (a, b) => {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  return x < y ? -1 : x > y ? 1 : 0;
};

export function asStated(reading) {
  return {
    campers: reading.campers.map((c) => ({
      name: c.name,
      number: c.number,
      division: c.division,
      bunk: c.bunk,
      choices: c.choices.map(({ name, rank, kind, day, period }) => ({
        name,
        rank,
        kind,
        day,
        period
      }))
    })),
    notKept: reading.notKept.map(({ name, kind, heading, text }) => ({
      name,
      kind,
      heading,
      text
    })),
    cantTellApart: reading.cantTellApart.map((c) => ({
      name: c.name,
      rows: c.rows.map((r) => r.row)
    })),
    notRead: reading.notRead.map(place).sort(byPlace),
    toCheck: reading.toCheck.map(place).sort(byPlace)
  };
}

export function expected(entry) {
  return {
    campers: entry.campers,
    notKept: entry.notKept,
    cantTellApart: entry.cantTellApart,
    notRead: entry.notRead.map(place).sort(byPlace),
    toCheck: entry.toCheck.map(place).sort(byPlace)
  };
}
