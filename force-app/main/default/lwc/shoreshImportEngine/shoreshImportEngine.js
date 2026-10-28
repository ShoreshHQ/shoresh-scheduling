/**
 * Import last year (slice 4b): reading a camp's schedule files and turning them into a proposed
 * season setup, with the questions the director answers before anything is saved. Pure
 * JavaScript, no server calls: the screen (c/shoreshImport) reads the files, calls
 * buildProposal on every answer, and sends the finished plan to the server.
 *
 * Built on Shoresh desktop's import (https://github.com/gfeitel1-maker/Scheduling-Project-,
 * src/ingest, Apache-2.0); see each file's header and the NOTICE file.
 */
import { parseCsv } from "./sheets";

// The reader on its own (one special day's or event's schedule from a file, ADR 0014 choice 17).
export { filesToPages } from "./sheets";
export { blockFromLabel } from "./structure";

export { buildProposal, LEAVE_OUT } from "./proposal";
export { NO_DIVISION } from "./reading-constants";
export { LAYOUTS } from "./layouts";
export {
  campFirstDay,
  campShortWeek,
  programDays,
  weeksOf,
  weeksToFill
} from "./weeks";

/** A comma-separated file as a file of one sheet. */
export function csvFile(name, text) {
  return { name, sheets: [{ name, rows: parseCsv(text), merges: [] }] };
}

/**
 * An Excel file (.xlsx or .xls) as sheets of text cells with their merged ranges, read with
 * SheetJS (passed in: the static resource in Salesforce, the npm build in tests). Cells are read
 * as the sheet shows them (raw: false), so times keep their formatting.
 */
export function workbookFile(XLSX, name, data) {
  const workbook = XLSX.read(data, { type: "array", cellDates: false });
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

/** Whether a file name is one the import reads. */
export function isReadable(name) {
  return /\.(xlsx|xlsm|xls|csv)$/i.test(String(name || ""));
}

export function isCsv(name) {
  return /\.csv$/i.test(String(name || ""));
}

export { questionCards } from "./questions";
export {
  planFor,
  foundLists,
  importNotes,
  unplacedLines,
  undoMessage
} from "./plan";
export { versionName } from "./version";
export { readAsGroups } from "./review";
export {
  BRING_BACK,
  DELETED,
  deletedKey,
  deletedAs,
  deletionsIn,
  programGroupKeys,
  broughtBack
} from "./deleted";

// Shared with the per-screen list imports (c/shoreshLists, slice 4c).
export { similarity, foldName, similarPairs, mergesFrom } from "./names";
export {
  WEEKDAYS,
  MONDAY_TO_FRIDAY,
  firstDayOf,
  weekOrder,
  tidy,
  looseKey,
  dayOf,
  timeRange,
  clock,
  shortClock,
  cellName,
  hasClockTime
} from "./text";
export {
  holdsNoDivision,
  realDivisionsOf,
  shownDivisionName
} from "./noDivision";
