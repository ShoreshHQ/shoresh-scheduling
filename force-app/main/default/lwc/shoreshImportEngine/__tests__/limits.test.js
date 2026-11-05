/**
 * How big a file the import reads, and which kinds (docs/import/files.md, INGEST-1): the desktop's
 * limits (exportSanitize.js IMPORT_LIMITS), checked before the file reaches the spreadsheet reader,
 * and its pickers' file types.
 */
import * as XLSX from "xlsx";
import {
  FILE_TYPES,
  IMPORT_LIMITS,
  csvFile,
  isReadable,
  readImportFile,
  refusedFile,
  workbookFile
} from "c/shoreshImportEngine";

const TOO_LARGE =
  "That file is too large to import (over 10 MB). Nothing was imported.";
const TOO_MANY_SHEETS =
  "That file has too many sheets (over 256) to import safely. Nothing was imported.";
const TOO_MANY_ROWS =
  "A sheet in that file has too many rows (over 20,000) to import safely. Nothing was imported.";

const MB = 1024 * 1024;

/** A workbook's bytes, its sheets each rowsEach rows of one cell. */
function workbookBytes(sheetCount, rowsEach = 1) {
  const book = XLSX.utils.book_new();
  for (let s = 0; s < sheetCount; s++) {
    const rows = Array.from({ length: rowsEach }, (_, r) => [`Row ${r + 1}`]);
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet(rows),
      `Sheet${s + 1}`
    );
  }
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
}

/** A chosen file that records whether anything read its bytes. */
function chosenFile(name, size, text = "Activity\nArchery") {
  return {
    name,
    size,
    text: jest.fn(() => Promise.resolve(text)),
    arrayBuffer: jest.fn(() =>
      Promise.resolve(new Uint8Array(workbookBytes(1)).buffer)
    )
  };
}

async function refusalOf(promise) {
  try {
    await promise;
  } catch (e) {
    return refusedFile(e);
  }
  return null;
}

function refusalNow(read) {
  try {
    read();
  } catch (e) {
    return refusedFile(e);
  }
  return null;
}

describe("the desktop's limits", () => {
  it("are 10 MB, 256 sheets and 20,000 rows a sheet", () => {
    expect(IMPORT_LIMITS).toEqual({
      maxBytes: 10 * MB,
      maxSheets: 256,
      maxRowsPerSheet: 20000
    });
  });
});

describe("INGEST-1.1: a file over 10 MB", () => {
  it.each(["Camp 2026.xlsx", "activities.csv"])(
    "INGEST-1.1: a chosen file over 10 MB is refused before any of it is read (%s)",
    async (name) => {
      const file = chosenFile(name, 10 * MB + 1);
      const loadSheetJs = jest.fn(() => Promise.resolve(XLSX));
      expect(await refusalOf(readImportFile(file, loadSheetJs))).toBe(
        TOO_LARGE
      );
      expect(file.text).not.toHaveBeenCalled();
      expect(file.arrayBuffer).not.toHaveBeenCalled();
      expect(loadSheetJs).not.toHaveBeenCalled();
    }
  );

  it("INGEST-1.1: workbook bytes over 10 MB never reach the spreadsheet reader", () => {
    const read = jest.fn();
    const spy = { ...XLSX, read };
    expect(
      refusalNow(() =>
        workbookFile(spy, "big.xlsx", new Uint8Array(10 * MB + 1))
      )
    ).toBe(TOO_LARGE);
    expect(read).not.toHaveBeenCalled();
  });

  it("INGEST-1.1: CSV text over 10 MB is refused, counted in the bytes a file takes", () => {
    // 3.5 million three-byte characters: under 10 MB of characters, over 10 MB of bytes.
    const text = "Activity\n" + "€".repeat(3.5 * MB);
    expect(text.length).toBeLessThan(10 * MB);
    expect(refusalNow(() => csvFile("big.csv", text))).toBe(TOO_LARGE);
  });

  it("a file of exactly 10 MB is read", async () => {
    const file = chosenFile("activities.csv", 10 * MB);
    const read = await readImportFile(file, () => Promise.resolve(XLSX));
    expect(read.sheets[0].rows).toEqual([["Activity"], ["Archery"]]);
  });
});

describe("INGEST-1.2: a file with more than 256 sheets", () => {
  it("INGEST-1.2: a workbook of 257 sheets is refused; 256 is read", () => {
    expect(
      refusalNow(() => workbookFile(XLSX, "many.xlsx", workbookBytes(257)))
    ).toBe(TOO_MANY_SHEETS);
    expect(
      workbookFile(XLSX, "ok.xlsx", workbookBytes(256)).sheets
    ).toHaveLength(256);
  });

  it("INGEST-1.2: 257 sheets are refused from the workbook's list of sheets, before any sheet is opened", () => {
    const read = jest.fn(XLSX.read);
    expect(
      refusalNow(() =>
        workbookFile({ ...XLSX, read }, "many.xlsx", workbookBytes(257))
      )
    ).toBe(TOO_MANY_SHEETS);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][1]).toMatchObject({ bookSheets: true });
  });

  it("INGEST-1.2: a camp with a tab per group per week, 16 groups by 8 weeks, is read", () => {
    expect(
      workbookFile(XLSX, "camp.xlsx", workbookBytes(16 * 8)).sheets
    ).toHaveLength(128);
  });
});

describe("INGEST-1.3: a sheet with more than 20,000 rows", () => {
  it("INGEST-1.3: a workbook sheet of 20,001 rows is refused; 20,000 is read", () => {
    expect(
      refusalNow(() => workbookFile(XLSX, "long.xlsx", workbookBytes(1, 20001)))
    ).toBe(TOO_MANY_ROWS);
    expect(
      workbookFile(XLSX, "ok.xlsx", workbookBytes(1, 20000)).sheets[0].rows
    ).toHaveLength(20000);
  });

  it("INGEST-1.3: a sheet's rows are read no further than 20,001, and a longer sheet is refused by its real size", () => {
    const read = jest.fn(XLSX.read);
    const sheetToJson = jest.fn(XLSX.utils.sheet_to_json);
    const spy = {
      ...XLSX,
      read,
      utils: { ...XLSX.utils, sheet_to_json: sheetToJson }
    };
    expect(
      refusalNow(() => workbookFile(spy, "long.xlsx", workbookBytes(1, 30000)))
    ).toBe(TOO_MANY_ROWS);
    expect(read.mock.calls[1][1]).toMatchObject({ sheetRows: 20001 });
    expect(sheetToJson).not.toHaveBeenCalled();
  });

  it("INGEST-1.3: a sheet claiming a million rows is refused before its rows are turned into cells", () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["Archery"]]);
    sheet["!ref"] = "A1:A1000000";
    XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
    const bytes = new Uint8Array(
      XLSX.write(book, { type: "array", bookType: "xlsx" })
    );
    const sheetToJson = jest.fn();
    const spy = {
      ...XLSX,
      utils: { ...XLSX.utils, sheet_to_json: sheetToJson }
    };
    expect(refusalNow(() => workbookFile(spy, "crafted.xlsx", bytes))).toBe(
      TOO_MANY_ROWS
    );
    expect(sheetToJson).not.toHaveBeenCalled();
  });

  it("INGEST-1.3: a CSV of 20,001 rows is refused; 20,000 is read", () => {
    const lines = (n) =>
      Array.from({ length: n }, (_, i) => `Row ${i + 1}`).join("\n");
    expect(refusalNow(() => csvFile("long.csv", lines(20001)))).toBe(
      TOO_MANY_ROWS
    );
    expect(csvFile("ok.csv", lines(20000)).sheets[0].rows).toHaveLength(20000);
  });
});

describe("refusedFile", () => {
  it("gives the refusal's words, and nothing for any other failure", () => {
    expect(refusedFile(new Error("boom"))).toBeNull();
    expect(refusedFile(null)).toBeNull();
  });
});

/** The rows the desktop gets from delimited text: SheetJS, tab-separated when the header says so. */
function desktopRows(text) {
  const header = text.split(/\r?\n/).find((l) => l.trim() !== "") || "";
  const tabs = (header.match(/\t/g) || []).length;
  const commas = (header.replace(/"[^"]*"/g, "").match(/,/g) || []).length;
  const FS = tabs > 0 && tabs >= commas ? "\t" : undefined;
  const bytes = new Uint8Array(Buffer.from(text, "utf8"));
  const book = XLSX.read(bytes, FS ? { type: "array", FS } : { type: "array" });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false
  });
}

describe("INGEST-1.5: the files each way in takes", () => {
  it("INGEST-1.5: each door takes the desktop's file types", () => {
    expect(FILE_TYPES).toEqual({
      schedule: [".xlsx", ".xlsm", ".xls", ".csv", ".tsv"],
      list: [".xlsx", ".xlsm", ".xls", ".csv"],
      choices: [".xlsx", ".xlsm", ".xls", ".csv", ".tsv", ".txt"]
    });
    expect(isReadable("Chugim.TXT", FILE_TYPES.choices)).toBe(true);
    expect(isReadable("Chugim.tsv", FILE_TYPES.choices)).toBe(true);
    expect(isReadable("Camp 2026.tsv", FILE_TYPES.schedule)).toBe(true);
    expect(isReadable("Camp 2026.txt", FILE_TYPES.schedule)).toBe(false);
    expect(isReadable("activities.tsv")).toBe(false);
    expect(isReadable("activities.csv")).toBe(true);
  });

  const TSV = [
    "Camper\tBunk\tChoices",
    "Avery Madeup\tBunk 1\tSwim, Archery, Ceramics, Drama, Hiking, Art, Music, Cooking",
    'Casey Madeup\tBunk 2\t"Art, ""the barn"""'
  ].join("\n");

  it("INGEST-1.5: a .tsv whose cells hold commas is read on its tabs, as the desktop reads it", async () => {
    const file = chosenFile("choices.tsv", TSV.length, TSV);
    const read = await readImportFile(file, () => Promise.resolve(XLSX));
    expect(read.sheets[0].rows).toEqual([
      ["Camper", "Bunk", "Choices"],
      [
        "Avery Madeup",
        "Bunk 1",
        "Swim, Archery, Ceramics, Drama, Hiking, Art, Music, Cooking"
      ],
      ["Casey Madeup", "Bunk 2", 'Art, "the barn"']
    ]);
    expect(read.sheets[0].rows).toEqual(desktopRows(TSV));
  });

  it("INGEST-1.5: a .txt is read as the same text, tab- or comma-separated, as the desktop reads it", async () => {
    const tabbed = await readImportFile(
      chosenFile("choices.txt", TSV.length, TSV),
      () => Promise.resolve(XLSX)
    );
    expect(tabbed.sheets[0].rows).toEqual(desktopRows(TSV));
    const CSV = "Camper,Bunk,Choice 1\nAvery Madeup,Bunk 1,Swim\n";
    const commas = await readImportFile(
      chosenFile("choices.txt", CSV.length, CSV),
      () => Promise.resolve(XLSX)
    );
    expect(commas.sheets[0].rows).toEqual(desktopRows(CSV));
  });
});
