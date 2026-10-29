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
  looseKey,
  looksLikeBlockLabel,
  tidy,
  timeRange
} from "./text";
import {
  isWeekHeading,
  weekInFileName,
  weekValue,
  withoutWeek
} from "./weekLabels";

const FOOTNOTE = /^\s*\*/;
const GENERIC_SHEET = /^(sheet|page|tab|table)\s*\d*$/i;
const EXTENSION = /\.(xlsx|xlsm|xls|csv|tsv|txt)$/i;

// ---------- comma-separated files ----------

/** The separator the first few lines use most: comma, semicolon, or tab. */
function delimiterOf(text) {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .slice(0, 5);
  const counts = [",", ";", "\t"].map((d) => ({
    d,
    n: lines.reduce((sum, line) => sum + line.split(d).length - 1, 0)
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
  if (prefix && /^[\p{L}\p{N}]{1,3}$/u.test(name)) {
    // "Camp - Juniors - Bunk " + "1": keep the last part of the shared start, "Bunk 1".
    const parts = prefix.split(/\s+[-–—]\s+|_/);
    const last = parts[parts.length - 1].replace(/[-–—_]+$/, "");
    // "camp-bunk-" (no spaces): its last word, "bunk".
    const before = tidy(/\s/.test(last) ? last : last.split(/[-–—]/).pop());
    if (before && /\p{L}/u.test(before)) {
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
    // Every title line above the grid, top to bottom (INGEST-2.7 picks the page's name).
    titles: title ? [title] : [],
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
        this.current.titles.push(this.current.title);
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
    titles: section.titles.map(tidy),
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

// ---------- a week column (weeks.md, INGEST-4.1) ----------

/** A column's cells in the rows under a heading row, title lines (one cell) left out. */
function weekCells(table, from, column) {
  return table
    .slice(from + 1)
    .filter((row) => filled(row) >= 2)
    .map((row) => row[column] || "")
    .filter((cell) => cell !== "" && !isWeekHeading(cell));
}

/**
 * The column whose heading says week ("Week", "Wk", "Session", "Week of", "Dates") and whose
 * cells below name weeks ("Week 2", "2", "7/6"), at least two of them and nearly all: { row,
 * column } of the first such heading, or null.
 */
function findWeekColumn(table) {
  for (let r = 0; r < table.length; r++) {
    const row = table[r];
    for (let c = 0; c < row.length; c++) {
      if (!isWeekHeading(row[c]) || filled(row) < 3) {
        continue;
      }
      const cells = weekCells(table, r, c);
      const weeks = cells.filter((cell) => weekValue(cell, row[c]));
      if (weeks.length >= 2 && weeks.length >= cells.length * 0.8) {
        return { row: r, column: c, heading: row[c] };
      }
    }
  }
  return null;
}

/** Merged ranges with the week column taken out; one inside it is dropped. */
function mergesWithout(merges, column) {
  const shift = (c) => (c > column ? c - 1 : c);
  return (merges || [])
    .filter((m) => m && m.s && m.e && !(m.s.c === column && m.e.c === column))
    .map((m) => ({
      s: { r: m.s.r, c: shift(m.s.c) },
      e: { r: m.e.r, c: shift(m.e.c) }
    }));
}

/**
 * A sheet with a week column: the column taken out of every row (a title line written in it is
 * kept whole), and each row's week, carried down over blank cells. { table, merges, weekOf }
 * (weekOf[row] a label, or ""); the sheet unchanged when it has no week column.
 */
export function splitWeekColumn(table, merges) {
  const found = findWeekColumn(table);
  if (!found) {
    return { table, merges, weekOf: table.map(() => "") };
  }
  const { column, heading } = found;
  let week = "";
  const weekOf = [];
  const rows = table.map((row, r) => {
    const cell = row[column] || "";
    const value = r > found.row ? weekValue(cell, heading) : null;
    if (value) {
      week = value;
    }
    weekOf.push(r > found.row ? week : "");
    const isTitle = cell !== "" && !value && !isWeekHeading(cell);
    return isTitle ? row : row.filter((_, c) => c !== column);
  });
  return { table: rows, merges: mergesWithout(merges, column), weekOf };
}

// ---------- a grid on its side (INGEST-2.11) ----------

const isTimedLabel = (cell) => looksLikeBlockLabel(cell) && hasClockTime(cell);

/**
 * How many leading cells of a heading row name its rows ("Division", "Group") when the cells
 * after them are time blocks, at least two and every one of them: the grid is on its side.
 * 0 when the row is not such a heading.
 */
function sidewaysLead(row) {
  const last = row.reduce((n, c, i) => (c !== "" ? i : n), -1);
  const lead = row.findIndex((c) => isTimedLabel(c));
  if (lead < 1 || lead > 2 || last - lead < 1) {
    return 0;
  }
  const rest = row.slice(lead, last + 1);
  const leadCells = row.slice(0, lead);
  return rest.every((c) => c === "" || isTimedLabel(c)) &&
    rest.filter(Boolean).length >= 2 &&
    leadCells.every((c) => !looksLikeBlockLabel(c))
    ? lead
    : 0;
}

/**
 * INGEST-2.11: a grid on its side, a row per group and a column per time block ("Division,
 * Group, Period 1 (8:30 - 9:15), ..."), stood upright: the time blocks become rows, the groups
 * columns, and a division column the division row above them (written once per division, as
 * a merged heading is). Title lines and anything else on the sheet stay where they are; a cell
 * merged across time blocks runs down its group's column. The sheet unchanged when no grid is
 * on its side.
 */
export function standUpright(table, merges) {
  const out = [];
  // Where each row that is not turned lands, and each turned cell: "row|column" -> [row, column].
  const rowTo = new Map();
  const cellTo = new Map();
  let turned = false;
  for (let r = 0; r < table.length; r++) {
    const lead = sidewaysLead(table[r]);
    const body = [];
    for (let b = r + 1; lead && b < table.length; b++) {
      const row = table[b];
      if (filled(row) < 2 || looksLikeBlockLabel(row[0] || "")) break;
      body.push(row);
    }
    if (!lead || body.length === 0) {
      rowTo.set(r, out.length);
      out.push(table[r]);
      continue;
    }
    turned = true;
    const header = table[r];
    const top = r + 1;
    if (lead === 2) {
      let last = null;
      out.push([
        "",
        ...body.map((row) => {
          const division = row[0] || "";
          const shown = division && division !== last ? division : "";
          last = division || last;
          return shown;
        })
      ]);
    }
    out.push(["", ...body.map((row) => row[lead - 1] || "")]);
    for (let c = lead; c < header.length; c++) {
      if (header[c] !== "") {
        const at = out.length;
        body.forEach((_, i) => cellTo.set(`${top + i}|${c}`, [at, i + 1]));
        out.push([header[c], ...body.map((row) => row[c] || "")]);
      }
    }
    r += body.length;
  }
  if (!turned) {
    return { table, merges };
  }
  // A merge across two time blocks of a group's row runs down its column once turned.
  const moved = (merges || []).flatMap((m) => {
    if (!m || !m.s || !m.e) return [];
    if (rowTo.has(m.s.r) && rowTo.has(m.e.r)) {
      return [
        {
          s: { ...m.s, r: rowTo.get(m.s.r) },
          e: { ...m.e, r: rowTo.get(m.e.r) }
        }
      ];
    }
    const from = cellTo.get(`${m.s.r}|${m.s.c}`);
    const to = cellTo.get(`${m.e.r}|${m.e.c}`);
    return from && to && m.s.r === m.e.r
      ? [{ s: { r: from[0], c: from[1] }, e: { r: to[0], c: to[1] } }]
      : [];
  });
  return { table: out, merges: moved };
}

// ---------- a key of letter codes (INGEST-2.13) ----------

const KEY_LINE = /^\s*([A-Za-z0-9]{1,3})\s*(?:=|:|–|—|\s-\s)\s*(\S.*?)\s*$/;
const KEY_HEADING = /^\s*(key|legend|codes?)\s*:?\s*$/i;

/** A row with only its first cell filled: that cell, else null. */
function onlyFirstCell(row) {
  return (row[0] || "") !== "" && filled(row) === 1 ? row[0] : null;
}

/**
 * INGEST-2.13: cells written as short codes ("A", "B") with a key on the sheet, two lines or
 * more one under another, each alone in its row ("A = Archery", "B: Basketball"), most of whose codes the grid
 * uses: each cell that is exactly a code is read as its name, and the key's lines (and a
 * "Key:" line over them) are not read as part of any schedule. A sheet with no such key is
 * unchanged. { table, key: [{ code, name }] }.
 */
export function readKey(table) {
  const found = [];
  table.forEach((row, r) => {
    const text = onlyFirstCell(row);
    const m = text && KEY_LINE.exec(text);
    if (m) {
      found.push({ row: r, code: m[1], name: tidy(m[2]) });
    }
  });
  // A key is two lines or more one under another; a line alone ("Bet - Bunk 3") is a title.
  const next = new Set(found.map((l) => l.row));
  const lines = found.filter((l) => next.has(l.row - 1) || next.has(l.row + 1));
  const used = new Set(
    table.flatMap((row) =>
      row
        .slice(1)
        .filter((c) => c !== "")
        .map(tidy)
    )
  );
  const codes = new Map(lines.map((l) => [l.code, l.name]));
  const inGrid = [...codes.keys()].filter((code) => used.has(code));
  if (codes.size < 2 || inGrid.length * 2 < codes.size) {
    return { table, key: [] };
  }
  const keyRows = new Set(lines.map((l) => l.row));
  lines.forEach((l) => {
    const above = l.row - 1;
    if (above >= 0 && KEY_HEADING.test(onlyFirstCell(table[above]) || "")) {
      keyRows.add(above);
    }
  });
  const coded = (c, i) => {
    return i > 0 && codes.has(tidy(c)) ? codes.get(tidy(c)) : c;
  };
  const read = table.map((row, r) => (keyRows.has(r) ? [] : row.map(coded)));
  return {
    table: read,
    key: [...codes].map(([code, name]) => ({ code, name }))
  };
}

// ---------- a key of colours (INGEST-2.19) ----------

const COLOUR_LINE =
  /^\s*(red|orange|yellow|green|blue|purple|violet|pink|grey|gray|brown|black|teal|light\s+\w+|dark\s+\w+)\s*(?:=|:|–|—|\s-\s)\s*(\S.*?)\s*$/i;

/**
 * INGEST-2.19: a key line naming a colour ("Blue = Swim"), alone in its row, whose colour no
 * cell is written as: the activity was shown only by its cells' colour, which a file loses on
 * export, so its cells are blank. Never read as free time on its own: the director is asked
 * (proposal.js). The lines are not read as part of any schedule. { table, colours: [{ colour,
 * name }] }.
 */
export function readColourKey(table) {
  const used = new Set(
    table.flatMap((row) => row.filter((c) => c !== "").map(looseKey))
  );
  const colours = [];
  const rows = new Set();
  table.forEach((row, r) => {
    const m = COLOUR_LINE.exec(onlyFirstCell(row) || "");
    if (m && !used.has(looseKey(m[1]))) {
      colours.push({ colour: tidy(m[1]), name: tidy(m[2]) });
      rows.add(r);
    }
  });
  return {
    table: colours.length
      ? table.map((row, r) => (rows.has(r) ? [] : row))
      : table,
    colours
  };
}

// ---------- the time written in every cell (INGEST-2.12) ----------

const LEADING_TIME =
  /^\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:[ap]\.?m\.?)?\s*(?:-|–|—|to)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:[ap]\.?m\.?)?)\s+(\S.*)$/i;

/** A row whose cells after the first all start with the same time range: that time, else null. */
function sharedCellTime(row) {
  const cells = row.slice(1).filter((c) => c !== "");
  if (cells.length < 2) {
    return null;
  }
  const times = cells.map((c) => LEADING_TIME.exec(c));
  if (times.some((m) => !m || !timeRange(m[1]))) {
    return null;
  }
  const first = tidy(times[0][1]);
  return times.every((m) => tidy(m[1]) === first) ? first : null;
}

/**
 * INGEST-2.12: a page with no time column whose cells each carry their block's time ("9-9:45
 * Art", "12:00-12:45 Lunch"): the time, the same across a row, is that row's time block, and the
 * cell is the rest ("Art"). The first column keeps its name ("Period 1 (9-9:45)"). Read only when
 * two rows or more are written so; a row whose cells give different times is left as it is.
 */
export function timesOutOfCells(table) {
  const times = table.map(sharedCellTime);
  if (times.filter(Boolean).length < 2) {
    return table;
  }
  return table.map((row, r) => {
    const time = times[r];
    if (!time) {
      return row;
    }
    const label = row[0] ? `${row[0]} (${time})` : time;
    return [
      label,
      ...row.slice(1).map((c) => (c === "" ? c : LEADING_TIME.exec(c)[2]))
    ];
  });
}

/** A page whose rows are for several weeks (a week column), split into one page per week. */
function byWeek(page, weeks) {
  const labels = [...new Set(weeks)];
  if (labels.length === 1) {
    return [labels[0] ? { ...page, week: labels[0] } : page];
  }
  return labels.map((week) => ({
    ...page,
    week,
    rows: page.rows.filter((_, i) => weeks[i] === week)
  }));
}

/**
 * One sheet as pages. `rows` are the sheet's cells (SheetJS `sheet_to_json(ws, { header: 1 })`,
 * or a parsed CSV); `merges` are SheetJS's merged ranges (0-based, inclusive), of which vertical
 * ones become blocks spanned. A sheet may hold several schedules one under another.
 */
export function sheetToPages(sheet, options = {}) {
  const table = (sheet.rows || []).map((row) => {
    return Array.isArray(row) ? row.map(cellText) : [];
  });
  const keyed = readKey(readColourKey(table).table);
  const cellsRead = timesOutOfCells(keyed.table);
  // A caller that turns sheets itself (a special day's schedule, c/shoreshSpecialSchedule).
  const upright = options.asWritten
    ? { table: cellsRead, merges: sheet.merges }
    : standUpright(cellsRead, sheet.merges);
  const split = splitWeekColumn(upright.table, upright.merges);
  const labelColumns = labelColumnCount(split.table);
  const sections = new SectionReader(split.table, labelColumns).read();
  const unmerged = { ...sheet, merges: split.merges };
  return sections
    .filter((section) => section.header)
    .flatMap((section, index) =>
      byWeek(
        { ...sectionToPage(section, unmerged, labelColumns), section: index },
        section.rawIndexes.map((i) => split.weekOf[i])
      )
    )
    .filter((page) => page.columns.some(Boolean) && page.rows.length > 0);
}

/** Whether a sheet has anything in it at all (empty sheets are skipped without a word). */
export function sheetHasContent(sheet) {
  return (sheet.rows || []).some(
    (row) => Array.isArray(row) && row.some((c) => tidy(c) !== "")
  );
}

/**
 * Every file's pages. files: [{ name, sheets: [{ name, rows, merges }] }]; options.maxWeek, the
 * season's number of weeks (a bare "W2" is a week only up to it, INGEST-4.2). Each page knows its
 * file and where its title came from; sheets with something in them but no schedule are
 * listed in `unread`, so the director is told what was not read.
 */
export function filesToPages(files, options = {}) {
  const pages = [];
  const unread = [];
  const colours = [];
  const perFile = (files || []).map((file) => {
    const read = [];
    for (const sheet of file.sheets || []) {
      const rows = (sheet.rows || []).map((row) => {
        return Array.isArray(row) ? row.map(cellText) : [];
      });
      readColourKey(rows).colours.forEach((c) =>
        colours.push({ ...c, file: file.name })
      );
      const found = sheetToPages(sheet, options);
      if (found.length === 0 && sheetHasContent(sheet)) {
        unread.push({ file: file.name, sheet: sheet.name });
      }
      found.forEach((page) => read.push(page));
    }
    return { file, read };
  });
  const notes = notesAboveEveryPage(perFile);
  for (const { file, read: found } of perFile) {
    const fileTitle = baseName(file.name);
    const named = sheetsNameTheirPages(found, options.maxWeek);
    const read = found.map((page) => withoutNotes(page, notes, named));
    const severalSheets = new Set(read.map((p) => p.sheet)).size > 1;
    read.forEach((page) => {
      // Where the page's name may come from, most specific first: a title line above the
      // grid, the sheet's name (unless it is "Sheet1"), the file's name.
      const sheetTitle = isGenericTitle(page.sheet) ? "" : page.sheet;
      // A comma-separated file's one sheet is named after the file: no name of its own.
      const ownSheet =
        !!sheetTitle &&
        (file.sheets || []).length === 1 &&
        page.sheet !== file.name;
      pages.push({
        ...page,
        file: file.name,
        names: {
          section: page.title,
          sheet: sheetTitle,
          file: fileTitle,
          fileWeek: weekInFileName(fileTitle, options.maxWeek),
          maxWeek: options.maxWeek,
          severalSheets,
          ownSheet
        }
      });
    });
  }
  return { pages, unread, colours };
}

// ---------- a note written above every page (INGEST-2.7) ----------

/**
 * Title lines written above every schedule of the files ("Updated June 2", "DRAFT v3"), when
 * there are two schedules or more: notes, which name no one page. A Set of lines.
 */
function notesAboveEveryPage(perFile) {
  const sections = [];
  for (const { read } of perFile) {
    // A page split by a week column is still one schedule.
    const seen = new Set();
    for (const page of read) {
      const key = `${page.sheet}|${page.section}`;
      if (!seen.has(key)) {
        seen.add(key);
        sections.push(page.titles);
      }
    }
  }
  if (sections.length < 2) {
    return new Set();
  }
  const [first, ...rest] = sections;
  return new Set(
    first.filter((line) => rest.every((titles) => titles.includes(line)))
  );
}

/**
 * Whether a file's sheets name its pages instead: several sheets, each with its own name, none
 * "Sheet1" and none only a day or a week ("Monday", "Week 2").
 */
function sheetsNameTheirPages(read, maxWeek) {
  const names = [...new Set(read.map((p) => p.sheet))];
  const onlyDayOrWeek = (name) =>
    withoutWeek(name, { maxWeek })
      .split(/[^\p{L}]+/u)
      .every((w) => !w || dayOf(w));
  return (
    names.length > 1 &&
    names.every((n) => !isGenericTitle(n) && !onlyDayOrWeek(n))
  );
}

/**
 * The page named by its last title line that is not a note. A note is dropped only where the page
 * keeps a name: another title line, or a sheet of its own naming it (a sheet per group); else
 * the lines are kept as they were (one title shared by every page, "Otters" in a file per week).
 */
function withoutNotes(page, notes, sheetsName) {
  const kept = page.titles.filter((line) => !notes.has(line));
  if (kept.length === page.titles.length) {
    return page;
  }
  if (kept.length) {
    return { ...page, title: kept[kept.length - 1] };
  }
  return sheetsName ? { ...page, title: "" } : page;
}
