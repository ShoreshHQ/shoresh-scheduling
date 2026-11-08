/**
 * Import last year (slice 4b): reading a camp's schedule files and turning them into a proposed
 * season setup, with the questions the director answers before anything is saved. Pure
 * JavaScript, no server calls: the screen (c/shoreshImport) reads the files, calls
 * buildProposal on every answer, and sends the finished plan to the server.
 *
 * Built on Shoresh desktop's import (https://github.com/gfeitel1-maker/Scheduling-Project-,
 * src/ingest, Apache-2.0); see each file's header and the NOTICE file.
 */
import { parseCsv } from "./engine.shoreshImportEngine.sheets.mjs";

// The reader on its own (one special day's or event's schedule from a file, ADR 0014 choice 17).
export { filesToPages } from "./engine.shoreshImportEngine.sheets.mjs";
export { blockFromLabel } from "./engine.shoreshImportEngine.structure.mjs";

export { buildProposal, LEAVE_OUT } from "./engine.shoreshImportEngine.proposal.mjs";
export { NO_DIVISION } from "./engine.shoreshImportEngine.reading-constants.mjs";
export { LAYOUTS } from "./engine.shoreshImportEngine.layouts.mjs";
export {
  campFirstDay,
  nameDaysFor,
  campTimeZoneOf,
  campShortWeek,
  programDays,
  weeksOf,
  weeksToFill
} from "./engine.shoreshImportEngine.weeks.mjs";

/**
 * How big a file the import reads (INGEST-1, desktop exportSanitize.js IMPORT_LIMITS, desktop ADR
 * 2026-08-08 §3a / F4): comfortably above any real camp, far below a file made to exhaust the
 * browser. Over any one, the file is refused whole and nothing is imported. Sheets are 256, not the
 * desktop's 32 (the ADR calls the bounds tunable): a camp with a tab per group per week, 16 × 8 =
 * 128 tabs, must import (coordinator, 2026-11-04).
 */
export const IMPORT_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxSheets: 256,
  maxRowsPerSheet: 20000
};

function refusal(text) {
  const error = new Error(text);
  error.shoreshWords = true;
  error.importRefused = true;
  return error;
}

/** INGEST-1.1: refused on its size alone, before any of it is read. */
export function checkFileSize(byteLength, limits = IMPORT_LIMITS) {
  if (byteLength > limits.maxBytes) {
    throw refusal(
      `That file is too large to import (over ${Math.round(limits.maxBytes / (1024 * 1024))} MB). Nothing was imported.`
    );
  }
}

/** INGEST-1.2 and 1.3: refused on its sheets, or a sheet's rows, before a cell is read. */
export function checkSheets(sheetRows, limits = IMPORT_LIMITS) {
  if (sheetRows.length > limits.maxSheets) {
    throw refusal(
      `That file has too many sheets (over ${limits.maxSheets}) to import safely. Nothing was imported.`
    );
  }
  if (sheetRows.some((rows) => rows > limits.maxRowsPerSheet)) {
    throw refusal(
      `A sheet in that file has too many rows (over ${limits.maxRowsPerSheet.toLocaleString("en-US")}) to import safely. Nothing was imported.`
    );
  }
}

/**
 * The refusal's own words when a file was refused for its size, else null; a screen that says
 * "brought in" gives its own words for what didn't happen.
 */
export function refusedFile(error, nothing = "Nothing was imported.") {
  return error && error.importRefused
    ? error.message.replace("Nothing was imported.", nothing)
    : null;
}

/**
 * The one way a chosen file is read (INGEST-1.4): its size is checked before its bytes are read,
 * then it is read as CSV or as a workbook. loadSheetJs gives SheetJS, loaded only when needed.
 */
export async function readImportFile(file, loadSheetJs) {
  checkFileSize(file.size);
  if (isCsv(file.name)) {
    return csvFile(file.name, await file.text());
  }
  return workbookFile(
    await loadSheetJs(),
    file.name,
    new Uint8Array(await file.arrayBuffer())
  );
}

/** The bytes text takes in a UTF-8 file (TextEncoder is not in every place this runs). */
function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** A comma-separated file as a file of one sheet. */
export function csvFile(name, text) {
  checkFileSize(utf8Length(text));
  const rows = parseCsv(text);
  checkSheets([rows.length]);
  return { name, sheets: [{ name, rows, merges: [] }] };
}

/** The name pasted cells go by in the review, where a file's name would be. */
export const PASTED = "Pasted cells";

/**
 * Cells copied from a spreadsheet and pasted (INGEST-1.6): tab-separated text, as Excel, Numbers and
 * Google Sheets put it on the clipboard, read as a file of one sheet, with a file's limits. Always
 * split on tabs, so a single column of names with commas in them stays one column. Nothing in it
 * but blanks is refused.
 */
export function pastedCells(text) {
  checkFileSize(utf8Length(text));
  const rows = parseCsv(text, "\t");
  checkSheets([rows.length]);
  if (!rows.some((row) => row.some((cell) => String(cell).trim() !== ""))) {
    throw refusal(
      "There was nothing in what was pasted. Nothing was imported."
    );
  }
  return { name: PASTED, sheets: [{ name: PASTED, rows, merges: [] }] };
}

/**
 * An Excel file (.xlsx or .xls) as sheets of text cells with their merged ranges, read with
 * SheetJS (passed in: the static resource in Salesforce, the npm build in tests). Cells are read
 * as the sheet shows them (raw: false), so times keep their formatting.
 */
export function workbookFile(XLSX, name, data) {
  checkFileSize(data.byteLength ?? data.length ?? 0);
  // The sheets are counted from the workbook's list of them, before any sheet is opened.
  const names = XLSX.read(data, { type: "array", bookSheets: true }).SheetNames;
  checkSheets(names.map(() => 0));
  // Then each sheet is read no further than one row past the limit; its real size is !fullref.
  const workbook = XLSX.read(data, {
    type: "array",
    cellDates: false,
    sheetRows: IMPORT_LIMITS.maxRowsPerSheet + 1
  });
  checkSheets(
    workbook.SheetNames.map((sheetName) => {
      const ws = workbook.Sheets[sheetName];
      const ref = ws["!fullref"] || ws["!ref"];
      return ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0;
    })
  );
  return {
    name,
    sheets: workbook.SheetNames.map((sheetName) => {
      const ws = workbook.Sheets[sheetName];
      return {
        name: sheetName,
        rows: XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: false,
          defval: "",
          blankrows: true
        }),
        merges: ws["!merges"] || []
      };
    })
  };
}

/**
 * The files each way in takes (INGEST-1.5), as the desktop's pickers: Import last year as
 * ImportScreen.jsx, camper choice sheets as AssignmentPanel.jsx (camps export CSV and TSV). A .txt
 * is tab- or comma-separated text here; Import last year's, offerings' and a special event's .txt
 * (text copied from a PDF on the desktop, src/ingest/textGrid.js) is not read yet.
 */
export const FILE_TYPES = {
  schedule: [".xlsx", ".xlsm", ".xls", ".csv", ".tsv"],
  list: [".xlsx", ".xlsm", ".xls", ".csv"],
  choices: [".xlsx", ".xlsm", ".xls", ".csv", ".tsv", ".txt"]
};

/** Whether a file name is one this way in reads (a list's, unless said). */
export function isReadable(name, types = FILE_TYPES.list) {
  const lower = String(name || "").toLowerCase();
  return types.some((type) => lower.endsWith(type));
}

/** Whether a file is text (comma- or tab-separated) rather than an Excel workbook. */
export function isCsv(name) {
  return /\.(csv|tsv|txt)$/i.test(String(name || ""));
}

export { questionCards } from "./engine.shoreshImportEngine.questions.mjs";
export {
  planFor,
  foundLists,
  importNotes,
  unplacedLines,
  undoMessage
} from "./engine.shoreshImportEngine.plan.mjs";
export { versionName } from "./engine.shoreshImportEngine.version.mjs";
export { readAsGroups } from "./engine.shoreshImportEngine.review.mjs";
export {
  BRING_BACK,
  DELETED,
  deletedKey,
  deletedAs,
  deletionsIn,
  programGroupKeys,
  broughtBack,
  nextKeyOf
} from "./engine.shoreshImportEngine.deleted.mjs";

// Shared with the per-screen list imports (c/shoreshLists, slice 4c).
export { similarity, foldName, similarPairs, mergesFrom } from "./engine.shoreshImportEngine.names.mjs";
export {
  WEEKDAYS,
  MONDAY_TO_FRIDAY,
  firstDayOf,
  weekOrder,
  tidy,
  looseKey,
  dayOf,
  dayNumberIn,
  dayNumberOf,
  timeRange,
  clock,
  shortClock,
  clockText,
  cellName,
  hasClockTime
} from "./engine.shoreshImportEngine.text.mjs";
export {
  holdsNoDivision,
  realDivisionsOf,
  shownDivisionName
} from "./engine.shoreshImportEngine.noDivision.mjs";
