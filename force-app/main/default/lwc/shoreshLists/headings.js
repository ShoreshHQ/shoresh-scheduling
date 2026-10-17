/*
 * Which sheet of a file is the list, and which column is which (slice 4c). Headings are matched
 * to the camp's own words and the usual other headings, after folding (capitals, spaces, and
 * punctuation ignored), never by guessing from what is in the cells. A heading that matches
 * nothing is "not used" until the director points it at a column; a column two headings claim
 * is not given to either on its own. Choices are remembered per camp and screen (Greg, #3).
 *
 * Adapted from Shoresh desktop src/ingest/entityColumnMapping.js and
 * src/utils/exportSanitize.js readEntitySheet (Apache-2.0, see NOTICE).
 */
import { buildTerms } from "c/shoreshTerms";
import { foldName, tidy } from "c/shoreshImportEngine";

/** "Not used": what a heading is pointed at when it is to be left out. */
export const UNUSED = "unused";

const SHOWN_TERMS = buildTerms([]);

/** The answer key for a heading's column: per screen and heading (the camp is the record's). */
export function columnKey(screenKey, heading) {
  return `columns|${screenKey}|${foldName(heading)}`;
}

function hasContent(sheet) {
  return (sheet.rows || []).some((row) => row.some((cell) => tidy(cell)));
}

/**
 * The sheet the list is on, never asked (the director's data is read, its format never
 * questioned): the only one with something in it; else the one named for the screen (the
 * camp's word or Shoresh's: "Bunks" or "Groups"); else the first whose headings give the
 * screen's name column; else the first with anything in it. The screen shows which was read,
 * and it can be changed.
 */
export function pickSheet(file, screen, t) {
  const sheets = (file.sheets || []).filter(hasContent);
  if (sheets.length <= 1) {
    return sheets.length ? sheets[0].name : null;
  }
  const names = new Set(
    [
      t.p(screen.term),
      t.s(screen.term),
      SHOWN_TERMS.p(screen.term),
      SHOWN_TERMS.s(screen.term)
    ].map(foldName)
  );
  const named = sheets.find((s) => names.has(foldName(s.name)));
  if (named) {
    return named.name;
  }
  const fits = sheets.find((s) => {
    const rows = s.rows || [];
    const at = headingRowIndex(rows);
    return at >= 0 && mapHeadings(rows[at], screen, {}).missing.length === 0;
  });
  return (fits || sheets[0]).name;
}

/** The names of the sheets with something in them, to choose from. */
export function sheetChoices(file) {
  return (file.sheets || []).filter(hasContent).map((s) => s.name);
}

/** Where the headings are: the first row with anything in it. */
export function headingRowIndex(rows) {
  return rows.findIndex((row) => row.some((cell) => tidy(cell)));
}

/**
 * Each heading's column: [{ index, text, key, column (a column key, or null for not used),
 * how }]. how: "matched" (by its words), "chosen" (answers), "unknown" (matches nothing),
 * "clash" (several headings match the same column: the director picks). Also: columns two
 * headings were pointed at (doubled), and required columns no heading gives (missing).
 */
export function mapHeadings(headings, screen, answers) {
  const byWord = new Map();
  screen.columns.forEach((column) => {
    column.words.forEach((word) => byWord.set(foldName(word), column.key));
  });
  const found = [];
  const seen = new Map();
  headings.forEach((text, index) => {
    if (!tidy(text)) {
      return;
    }
    // A heading written twice gets its own key the second time ("Notes", "Notes#2").
    const folded = foldName(text);
    seen.set(folded, (seen.get(folded) || 0) + 1);
    const key =
      columnKey(screen.key, text) +
      (seen.get(folded) > 1 ? `#${seen.get(folded)}` : "");
    const chosen = answers[key];
    if (chosen !== undefined) {
      found.push({
        index,
        text: tidy(text),
        key,
        column: chosen === UNUSED ? null : chosen,
        how: "chosen"
      });
      return;
    }
    const matched = byWord.get(foldName(text)) || null;
    found.push({
      index,
      text: tidy(text),
      key,
      column: matched,
      how: matched ? "matched" : "unknown"
    });
  });
  // A column matched by two headings goes to neither on its own.
  const claims = new Map();
  found
    .filter((h) => h.how === "matched")
    .forEach((h) => claims.set(h.column, (claims.get(h.column) || 0) + 1));
  found.forEach((h) => {
    if (h.how === "matched" && claims.get(h.column) > 1) {
      h.how = "clash";
      h.clashWith = h.column;
      h.column = null;
    }
  });
  const used = new Map();
  found
    .filter((h) => h.column)
    .forEach((h) => used.set(h.column, [...(used.get(h.column) || []), h]));
  const doubled = [...used.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([column]) => column);
  const missing = screen.columns
    .filter((c) => c.required && !used.has(c.key))
    .map((c) => c.key);
  return { headings: found, doubled, missing };
}
