/*
 * A sheet with no camper column: days across, periods down. Either a planner (one camper's own
 * sheet, one choice in each period) or a menu (what is offered, several activities a period).
 *
 * Adapted from Shoresh desktop (https://github.com/gfeitel1-maker/Scheduling-Project-,
 * Apache-2.0): src/ingest/preferenceSheet.js detectGridLayout, and its ADR
 * 2026-09-27-elective-preference-etl §14.1a: a page that names no camper is ONE camper (the
 * sheet is theirs; the name comes from the page, else the sheet, else the file), never zero; and
 * a menu is told from a planner by how many options a period holds, never by guessing what the
 * page means. See the NOTICE file.
 */
import { dayOf, tidy } from "c/shoreshImportEngine";
import {
  CHOICE_KINDS,
  cellAt,
  choicesInCell,
  columnLetter,
  isBlankRow
} from "./cells";
import { periodLabel } from "./headings";

const PERIOD_LABEL =
  /^(?:period|per|block|p)\s*#?\s*\d{1,2}\b|\d{1,2}[:.]\d{2}/i;
const NAME_LINE =
  /^(?:camper'?s?\s+|child'?s?\s+|student'?s?\s+)?name\s*[:\-–]\s*(.+)$/i;
const GENERIC_SHEET = /^(?:sheet|page|tab|table)\s*\d*$/i;
const EXTENSION = /\.(?:xlsx|xlsm|xls|csv|tsv|txt)$/i;
const SCAN = 12;

/** The day a heading cell names when it is only a day ("Monday", "Tue"), else null. */
function dayHeading(text) {
  const t = tidy(text);
  return t && t.split(" ").length === 1 ? dayOf(t) : null;
}

/** The days row: day headings in two or more columns after the first. */
function findDays(sheet) {
  const limit = Math.min(sheet.rows.length, SCAN);
  for (let r = 0; r < limit; r++) {
    const row = sheet.rows[r] || [];
    const days = [];
    row.forEach((v, c) => {
      const day = c > 0 ? dayHeading(v) : null;
      if (day) days.push({ index: c, day });
    });
    if (days.length >= 2) return { row: r, days };
  }
  return null;
}

/** How many columns each day spans: merged across, or blank headings to its right. */
function widths(sheet, header, days) {
  const row = sheet.rows[header] || [];
  return days.map(({ index }, i) => {
    const merge = (sheet.merges || []).find(
      (m) => m.s.r === header && m.e.r === header && m.s.c === index
    );
    if (merge) return merge.e.c - merge.s.c + 1;
    const end = i + 1 < days.length ? days[i + 1].index : row.length;
    let width = 1;
    while (index + width < end && tidy(row[index + width]) === "") width++;
    return width;
  });
}

function camperName(file, sheet, header, out) {
  for (let r = 0; r < header; r++) {
    for (const value of sheet.rows[r] || []) {
      const match = NAME_LINE.exec(tidy(value));
      if (match) return { name: tidy(match[1]), nameRow: r };
    }
  }
  if (!GENERIC_SHEET.test(tidy(sheet.name))) {
    out.toCheck.push({ kind: "nameFromSheet", sheet: sheet.name });
    return { name: tidy(sheet.name), nameRow: -1 };
  }
  const base = tidy(
    String(file.name || "")
      .replace(/^.*[\\/]/, "")
      .replace(EXTENSION, "")
  );
  out.toCheck.push({ kind: "nameFromFile", sheet: sheet.name });
  return { name: base, nameRow: -1 };
}

/**
 * Read a days-across, periods-down sheet into out (rows and findings). Returns false when the
 * sheet is not one, so the caller can say the sheet was not read.
 */
export function readPlanner(file, sheet, out) {
  const found = findDays(sheet);
  if (!found) return false;
  const periodRows = [];
  for (let r = found.row + 1; r < sheet.rows.length; r++) {
    if (PERIOD_LABEL.test(cellAt(sheet.rows[r], 0))) periodRows.push(r);
  }
  if (periodRows.length === 0) return false;

  // A menu offers several activities a period: two or more columns under a day, or most of its
  // cells holding a list. A planner holds one choice a period. No camper is read from a menu.
  const spans = widths(sheet, found.row, found.days);
  const cells = periodRows.flatMap((r) =>
    found.days.map(({ index }) => cellAt(sheet.rows[r], index)).filter(Boolean)
  );
  const lists = cells.filter((t) => /[,;\n]/.test(t)).length;
  if (spans.some((w) => w > 1) || lists * 2 > cells.length) {
    out.notRead.push({ kind: "menu", sheet: sheet.name });
    return true;
  }

  const { name, nameRow } = camperName(file, sheet, found.row, out);
  const at = (r) => ({ sheet: sheet.name, row: r + 1 });
  for (let r = 0; r < found.row; r++) {
    if (r !== nameRow && !isBlankRow(sheet.rows[r])) {
      out.notRead.push({ kind: "aboveTable", ...at(r) });
    }
  }
  const choices = [];
  const firstRow = periodRows[0];
  for (let r = found.row + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (!periodRows.includes(r)) {
      if (!isBlankRow(row))
        out.notRead.push({ kind: "outsideTable", ...at(r) });
      continue;
    }
    const period = periodLabel(cellAt(row, 0));
    for (const { index, day } of found.days) {
      const report = (list, item) =>
        out[list].push({ ...item, ...at(r), column: columnLetter(index) });
      const rule = { rank: 1, kind: CHOICE_KINDS.CELL, day, period };
      for (const c of choicesInCell(
        cellAt(row, index),
        rule,
        report,
        out.known
      )) {
        choices.push({
          ...c,
          sheet: sheet.name,
          row: r + 1,
          column: columnLetter(index)
        });
      }
    }
  }
  out.rows.push({
    ...at(nameRow >= 0 ? nameRow : firstRow),
    name,
    number: null,
    division: null,
    bunk: null,
    choices,
    notes: []
  });
  return true;
}
