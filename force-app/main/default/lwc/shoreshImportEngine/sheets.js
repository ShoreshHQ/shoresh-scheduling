/*
 * From a file's sheets (rows of cells) to pages: one schedule grid each, with its title, its
 * column headings, the division written above a column (if any), and its time-block rows.
 *
 * Adapted from Shoresh desktop (https://github.com/gfeitel1-maker/Scheduling-Project-,
 * Apache-2.0): src/ingest/sheetGrid.js (sheetToPage, workbookToPages, footnotes, vertical merges
 * as blocks spanned, groupNameFromFilename, sharedFilenamePrefix). New here: several schedules
 * stacked on one sheet (a day name or a new heading row starts the next), a second label column
 * holding the times, a division row above the group headings, and comma-separated files.
 */
import {
  cellText,
  dayOf,
  hasClockTime,
  looksLikeBlockLabel,
  tidy
} from "./text";

const FOOTNOTE = /^\s*\*/;
const GENERIC_SHEET = /^(sheet|page|tab|table)\s*\d*$/i;
const EXTENSION = /\.(xlsx|xlsm|xls|csv|tsv|txt)$/i;

// ---------- comma-separated files ----------

function delimiterOf(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const counts = [",", ";", "\t"].map((d) => ({
    d,
    n: firstLine.split(d).length - 1
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

/**
 * A comma-separated file as rows of cells. Quoted cells may hold commas, line breaks, and
 * doubled quotes; semicolon- and tab-separated files are recognised from the first line.
 */
export function parseCsv(input) {
  const text = String(input || "").replace(/^\uFEFF/, "");
  const delimiter = delimiterOf(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------- file names ----------

/** A file's name without its folder and extension. */
export function baseName(fileName) {
  return tidy(
    String(fileName || "")
      .replace(/^.*[\\/]/, "")
      .replace(EXTENSION, "")
  );
}

function commonStart(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  return a.slice(0, i);
}

/**
 * The opening words every one of a set of file names shares ("Camp 2025 - " in a set of
 * one-file-per-group exports), cut back to a whole word (desktop sharedFilenamePrefix). Nothing
 * is shared with only one file.
 */
export function sharedPrefix(fileNames) {
  const names = (fileNames || []).map(baseName);
  if (names.length < 2) {
    return "";
  }
  const start = names
    .slice(1)
    .reduce((prefix, name) => commonStart(prefix, name), names[0]);
  return start.replace(/[^\s\-–—_]*$/, "");
}

/**
 * The part of a file name that tells files apart. When that is only a number or a short code
 * ("Camp 2025 - Bunk 1" and "Camp 2025 - Bunk 2" share "Camp 2025 - Bunk "), the word before it
 * is kept too, so the group is "Bunk 1", not "1". Dashes and underscores between words read as
 * spaces ("bunk-1" -> "bunk 1").
 */
export function distinctName(fileName, prefix) {
  const full = baseName(fileName);
  let name =
    prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full;
  name = tidy(name.replace(/^[\s\-–—_]+/, ""));
  if (prefix && /^[A-Za-z0-9]{1,3}$/.test(name)) {
    // "Camp - Juniors - Bunk " + "1": keep the last part of the shared start, "Bunk 1".
    const parts = prefix.split(/\s+[-–—]\s+|_/);
    const last = parts[parts.length - 1].replace(/[-–—_]+$/, "");
    // "camp-bunk-" (no spaces): its last word, "bunk".
    const before = tidy(/\s/.test(last) ? last : last.split(/[-–—]/).pop());
    if (before && /[A-Za-z]/.test(before)) {
      name = `${before} ${name}`;
    }
  }
  return /\s/.test(name) ? name : tidy(name.replace(/[-_]+/g, " "));
}

export function isGenericTitle(title) {
  return !tidy(title) || GENERIC_SHEET.test(tidy(title));
}

// ---------- one sheet ----------

function filled(cells) {
  return cells.filter((c) => c !== "").length;
}

/** How many columns at the left hold the time-block labels: 1, or 2 when times sit beside names. */
function labelColumnCount(table) {
  let timesInSecond = 0;
  let timesInFirst = 0;
  for (const row of table) {
    if (hasClockTime(row[0] || "")) {
      timesInFirst++;
    } else if (hasClockTime(row[1] || "") && (row[0] || "") !== "") {
      timesInSecond++;
    }
  }
  return timesInSecond >= 2 && timesInSecond > timesInFirst ? 2 : 1;
}

function labelOf(row, labelColumns) {
  return tidy(row.slice(0, labelColumns).join(" "));
}

/** A row that only names a day ("Monday", "TUESDAY 6/30"): the next schedule on the sheet. */
function dayHeading(row) {
  const texts = row.filter((c) => c !== "");
  if (texts.length !== 1 || texts[0].length > 30) {
    return null;
  }
  const words = texts[0].split(/[^A-Za-z]+/).filter(Boolean);
  return words.length >= 1 && words.length <= 3 && dayOf(words[0])
    ? texts[0]
    : null;
}

/** The text over each column of a heading row, carried across the blank (merged) cells after it. */
function carriedAcross(row, from, width) {
  const result = [];
  let current = null;
  for (let c = from; c < width; c++) {
    if ((row[c] || "") !== "") {
      current = row[c];
    }
    result.push(current);
  }
  return result;
}

function newSection(title) {
  return {
    title,
    header: null,
    above: null,
    rows: [],
    rawIndexes: [],
    notes: []
  };
}

class SectionReader {
  constructor(table, labelColumns) {
    this.table = table;
    this.labelColumns = labelColumns;
    this.sections = [];
    this.current = newSection(null);
    this.lastHeader = null;
    this.pendingTitle = null;
    this.previousRow = null;
  }

  close() {
    if (this.current.rows.length > 0) {
      this.sections.push(this.current);
    }
  }

  start(title) {
    this.close();
    this.current = newSection(title);
  }

  read() {
    this.table.forEach((row, index) => this.readRow(row, index));
    this.close();
    return this.sections;
  }

  readRow(row, index) {
    const label = labelOf(row, this.labelColumns);
    const rest = row.slice(this.labelColumns);
    if (filled(row) === 0 || (FOOTNOTE.test(label) && filled(rest) === 0)) {
      return;
    }
    const day = dayHeading(row);
    if (day) {
      this.start(day);
      return;
    }
    if (looksLikeBlockLabel(label)) {
      this.readBlockRow(row, index, label, rest);
      return;
    }
    this.readOtherRow(row);
  }

  readBlockRow(row, index, label, rest) {
    if (!this.current.header) {
      if (!this.lastHeader) {
        return;
      }
      this.current.header = this.lastHeader.header;
      this.current.above = this.lastHeader.above;
    }
    this.current.rows.push({ label, cells: rest });
    this.current.rawIndexes.push(index);
    this.previousRow = row;
  }

  readOtherRow(row) {
    const restFilled = filled(row.slice(this.labelColumns));
    if (restFilled === 0) {
      // A title line ("Bunk 3", "Camp Sunshine – Monday"): it names the next schedule.
      if (this.current.rows.length > 0) {
        this.start(row.find((c) => c !== ""));
      } else {
        this.current.title = row.find((c) => c !== "");
      }
      this.previousRow = row;
      return;
    }
    if (this.current.rows.length > 0) {
      this.start(null);
    }
    // A heading row. A shorter heading just above it is the divisions over the columns.
    const above =
      this.current.header &&
      filled(this.current.header) <
        restFilled + filled(row.slice(0, this.labelColumns))
        ? this.current.header
        : null;
    this.current.above = above;
    this.current.header = row;
    this.lastHeader = { header: row, above };
    this.previousRow = row;
  }
}

function blockSpans(section, merges, labelColumns) {
  const spans = section.rows.map(() => []);
  for (const merge of merges || []) {
    const s = merge && merge.s;
    const e = merge && merge.e;
    if (!s || !e || e.r <= s.r || s.c !== e.c) {
      continue;
    }
    const bodyIndex = section.rawIndexes.indexOf(s.r);
    const column = s.c - labelColumns;
    if (bodyIndex === -1 || column < 0) {
      continue;
    }
    const count = section.rawIndexes.filter(
      (raw) => raw >= s.r && raw <= e.r
    ).length;
    if (count >= 2) {
      spans[bodyIndex][column] = count;
    }
  }
  return spans;
}

function sectionToPage(section, sheet, labelColumns) {
  const header = section.header.map(tidy);
  let width = header.length;
  while (width > labelColumns && !header[width - 1]) {
    width--;
  }
  const columns = header.slice(labelColumns, width);
  const divisions = section.above
    ? carriedAcross(section.above.map(tidy), labelColumns, width)
    : columns.map(() => null);
  const spans = blockSpans(section, sheet.merges, labelColumns);
  return {
    sheet: sheet.name,
    title: tidy(section.title || ""),
    corner: tidy(header.slice(0, labelColumns).join(" ")),
    columns,
    divisions,
    rows: section.rows.map((row, i) => ({
      label: row.label,
      cells: columns.map((_, c) => tidy(row.cells[c] || "")),
      spans: columns.map((_, c) => spans[i][c] || 1)
    }))
  };
}

/**
 * One sheet as pages. `rows` are the sheet's cells (SheetJS `sheet_to_json(ws, { header: 1 })`,
 * or a parsed CSV); `merges` are SheetJS's merged ranges (0-based, inclusive), of which vertical
 * ones become blocks spanned. A sheet may hold several schedules one under another.
 */
export function sheetToPages(sheet) {
  const table = (sheet.rows || []).map((row) => {
    return Array.isArray(row) ? row.map(cellText) : [];
  });
  const labelColumns = labelColumnCount(table);
  const sections = new SectionReader(table, labelColumns).read();
  return sections
    .filter((section) => section.header)
    .map((section) => sectionToPage(section, sheet, labelColumns))
    .filter((page) => page.columns.some(Boolean) && page.rows.length > 0);
}

/** Whether a sheet has anything in it at all (empty sheets are skipped without a word). */
export function sheetHasContent(sheet) {
  return (sheet.rows || []).some(
    (row) => Array.isArray(row) && row.some((c) => tidy(c) !== "")
  );
}

/**
 * Every file's pages. files: [{ name, sheets: [{ name, rows, merges }] }]. Each page knows its
 * file and where its title came from; sheets with something in them but no schedule are
 * listed in `unread`, so the director is told what was not read.
 */
export function filesToPages(files) {
  const pages = [];
  const unread = [];
  for (const file of files || []) {
    const fileTitle = baseName(file.name);
    const read = [];
    for (const sheet of file.sheets || []) {
      const found = sheetToPages(sheet);
      if (found.length === 0 && sheetHasContent(sheet)) {
        unread.push({ file: file.name, sheet: sheet.name });
      }
      found.forEach((page) => read.push(page));
    }
    const severalSheets = new Set(read.map((p) => p.sheet)).size > 1;
    read.forEach((page) => {
      // Where the page's name may come from, most specific first: a title line above the
      // grid, the sheet's name (unless it is "Sheet1"), the file's name.
      const sheetTitle = isGenericTitle(page.sheet) ? "" : page.sheet;
      pages.push({
        ...page,
        file: file.name,
        names: {
          section: page.title,
          sheet: sheetTitle,
          file: fileTitle,
          severalSheets
        }
      });
    });
  }
  return { pages, unread };
}
