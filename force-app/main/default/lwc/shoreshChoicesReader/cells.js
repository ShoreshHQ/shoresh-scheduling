/*
 * Cells of a choices sheet: what one cell holds, and the kinds of choice. Shared by the table
 * reader (shoreshChoicesReader.js) and the planner reader (planner.js).
 */
import { tidy } from "c/shoreshImportEngine";

/** How a choice was stated. */
export const CHOICE_KINDS = {
  // One of an ordered list (for the week, or for one period): rank 1 is the first choice.
  RANKED: "ranked",
  // The camper's one choice for a day or period (rank 1 by construction).
  CELL: "cell",
  // One of several choices given in no order (rank null). Never shown as a rank.
  UNORDERED: "unordered"
};
const { UNORDERED } = CHOICE_KINDS;

// A cell holding several choices: commas, semicolons, line breaks, or a slash with spaces.
const LIST = /\s*(?:[,;\n]|\s\/\s)\s*/;
// A cell saying "nothing chosen".
const NOTHING = /^(?:none|n\/?a|-+|tbd|\?+)$/i;
// A cell that is not an activity name: only digits and punctuation, or a yes/no tick.
const NOT_A_NAME = /^[\d\s.,:/#%-]+$|^(?:yes|no|y|n|x|true|false|✓|✔)$/i;

export function columnLetter(index) {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export const cellAt = (row, index) => tidy((row || [])[index]);
export const isBlankRow = (row) => (row || []).every((v) => tidy(v) === "");
const partsOf = (text) =>
  text
    .split(LIST)
    .map((p) => tidy(p))
    .filter((p) => p && !NOTHING.test(p));

/**
 * One cell's choices under a column's meaning. `report` receives the cell's findings.
 * Returns choices: [{ name, rank, kind, day, period }].
 */
export function choicesInCell(text, { rank, kind, day, period }, report) {
  if (!text || NOTHING.test(text)) return [];
  if (NOT_A_NAME.test(text)) {
    report("notRead", { kind: "notAChoice", text });
    return [];
  }
  const parts = partsOf(text);
  if (parts.length > 1) {
    if (kind !== UNORDERED) report("toCheck", { kind: "listInOneCell", text });
    return parts.map((name) => ({
      name,
      rank: null,
      kind: UNORDERED,
      day,
      period
    }));
  }
  return [{ name: parts[0], rank, kind, day, period }];
}
