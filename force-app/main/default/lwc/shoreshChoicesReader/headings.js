/*
 * What a column heading on a choices sheet means, and where a sheet's heading row is.
 *
 * Adapted from Shoresh desktop (https://github.com/gfeitel1-maker/Scheduling-Project-,
 * Apache-2.0): src/ingest/preferenceSheet.js (the heading patterns: rank headings in their
 * three written forms, a day and period named in a heading, split first and last names, camper
 * numbers, one row per choice, the unordered-activities column, and the header row found below a
 * title). New here: two-row headings (a merged "Choices" or day over 1, 2, 3), the division and
 * the bunk told apart, and comment and opt-out columns recognised so they can be shown and not
 * kept. See the NOTICE file.
 *
 * Headings, never cell contents, decide what a column is (as in ADR 0007 §2). A heading this file
 * does not know is "not used": the reader names it and never copies what the column holds.
 */
import { dayOf, tidy } from "c/shoreshImportEngine";

const ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth"
];

// Words a choice heading may carry besides its day, period and rank ("Tue P2 - 1st choice").
// Anything else makes the heading something else: "Monday Night Live" names a day and is not a
// choice column.
const FILLER = new Set([
  "choice",
  "choices",
  "pick",
  "preference",
  "pref",
  "rank",
  "option",
  "elective",
  "electives",
  "chug",
  "chugim",
  "activity",
  "activities",
  "your",
  "the",
  "for",
  "#"
]);

const WHO = "(?:camper|student|child|participant)s?";
const FIELDS = [
  ["firstName", new RegExp(`^(?:${WHO} )?(?:first|given) name$`)],
  ["lastName", new RegExp(`^(?:${WHO} )?(?:last|family|sur) ?name$`)],
  ["number", new RegExp(`^${WHO} ?(?:id|number|no|num|#)$|^id$`)],
  ["name", new RegExp(`^(?:${WHO} )?(?:full )?name$|^${WHO}$`)],
  [
    "division",
    new RegExp(`^(?:${WHO} )?(?:division|edah|eidah|unit|age group|grade)$`)
  ],
  ["bunk", new RegExp(`^(?:${WHO} )?(?:bunk|cabin|tent|group)(?: name)?$`)],
  [
    "optOut",
    /\bopt ?out\b|\bsit out\b|\bnot participat|\bexcused\b|\bno swim\b/
  ],
  [
    "comment",
    /\bcomments?\b|\bnotes?\b|\banything else\b|\bquestions?\b|\bmessage\b|\brequests?\b|\bmedical\b|\ballerg|\btell us\b/
  ],
  [
    "rankValue",
    /^(?:rank|ranking|choice rank|priority|preference (?:number|rank)|choice (?:number|#)|order)$/
  ],
  [
    "choiceValue",
    /^(?:activity|activity name|choice|elective|chug|selection|option)$/
  ],
  [
    "choices",
    /^(?:(?:all|acceptable|preferred|chosen|interested|selected) )?(?:activities|choices|electives|chugim|options)(?: (?:chosen|selected|of interest))?$/
  ],
  ["dayValue", /^day(?: of (?:the )?week)?$/],
  ["periodValue", /^(?:period|time block|block|time slot|slot)$/]
];

/** A heading in lower case, punctuation as spaces, a bracketed aside dropped. "#" is kept. */
function normal(heading) {
  return tidy(heading)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[_.:;,'’*?!/\\\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PERIOD = /\b(period|per|block|p)\s*#?\s*(\d{1,2})\b/;

/** "P2", "per 2", "Period 2" as "Period 2"; "Block 2" stays a block. */
export function periodLabel(text) {
  const match = PERIOD.exec(normal(text));
  if (match) {
    return `${match[1] === "block" ? "Block" : "Period"} ${Number(match[2])}`;
  }
  const bare = tidy(text);
  return /^\d{1,2}$/.test(bare) ? `Period ${Number(bare)}` : bare;
}

/** The rank a value or heading part states ("1", "#1", "1st", "First"), or null. */
export function rankOf(text) {
  const t = normal(text);
  let m = /^#?\s*(\d{1,2})(?:st|nd|rd|th)?$/.exec(t);
  if (m) return Number(m[1]);
  m = /^(\w+)$/.exec(t);
  if (m && ORDINALS.includes(m[1])) return ORDINALS.indexOf(m[1]) + 1;
  return null;
}

const RANK_IN_HEADING = [
  /#\s*(\d{1,2})\b/,
  /\b(\d{1,2})\s*(?:st|nd|rd|th)\b/,
  /\b(?:choice|rank|pref|preference|option|pick)\s*(\d{1,2})\b/,
  /\b(\d{1,2})\b/
];

/** A heading naming a choice: its rank, day and period (any may be null), or null. */
function choiceHeading(text) {
  let rest = ` ${text} `;
  let day = null;
  for (const word of text.split(" ")) {
    const found = word.length >= 3 ? dayOf(word) : null;
    if (found && !day) {
      day = found;
      rest = rest.replace(` ${word} `, " ");
    }
  }
  let period = null;
  const p = PERIOD.exec(rest);
  if (p) {
    period = `${p[1] === "block" ? "Block" : "Period"} ${Number(p[2])}`;
    rest = rest.replace(p[0], " ");
  }
  let rank = null;
  for (const pattern of RANK_IN_HEADING) {
    const r = pattern.exec(rest);
    if (r) {
      rank = Number(r[1]);
      rest = rest.replace(r[0], r[0].replace(r[1], " "));
      break;
    }
  }
  if (rank === null) {
    const word = rest.split(" ").find((w) => ORDINALS.includes(w));
    if (word) {
      rank = ORDINALS.indexOf(word) + 1;
      rest = rest.replace(` ${word} `, " ");
    }
  }
  const left = rest
    .replace(/\b(?:st|nd|rd|th)\b/g, " ")
    .split(" ")
    .filter(Boolean);
  if ((day || period || rank !== null) && left.every((w) => FILLER.has(w))) {
    return { use: "choice", rank, day, period };
  }
  return null;
}

/**
 * What a heading means, or null when the reader does not use it:
 * { use: "name" | "firstName" | "lastName" | "number" | "division" | "bunk" | "comment" |
 *   "optOut" | "rankValue" | "choiceValue" | "choices" | "dayValue" | "periodValue" }, or
 * { use: "choice", rank, day, period } for a column holding one choice (a rank, a day and
 * period, or both).
 */
export function headingMeaning(heading) {
  const text = normal(heading);
  if (!text) return null;
  for (const [use, pattern] of FIELDS) {
    if (pattern.test(text)) return { use };
  }
  return choiceHeading(text);
}

// ---------- the heading row ----------

const isChoiceUse = (m) =>
  Boolean(m) && ["choice", "choices", "choiceValue"].includes(m.use);

function textRow(rows, r) {
  return (rows[r] || []).map((v) => tidy(v));
}

/**
 * The headings of row r, with row r - 1 read as a heading above them when it is one: a cell
 * merged across columns ("Choices" over 1, 2, 3; "Tuesday" over 1st, 2nd, 3rd), or a label with
 * blanks to its right over bare ranks (the same thing in a comma-separated file), or a heading
 * merged down over a blank ("Camper Name" over two rows).
 * Returns { columns: [{ index, heading, meaning }], usesRowAbove }.
 */
function headingsAt(sheet, r) {
  const base = textRow(sheet.rows, r);
  const top = r > 0 ? textRow(sheet.rows, r - 1) : [];
  const width = Math.max(base.length, top.length);
  for (const m of sheet.merges || []) {
    if (m.s.r === r - 1 && m.e.r === r - 1) {
      for (let c = m.s.c + 1; c <= m.e.c; c++) top[c] = top[m.s.c];
    }
  }
  for (let c = 1; c < width; c++) {
    const bare = headingMeaning(base[c] || "");
    if (
      !top[c] &&
      top[c - 1] &&
      bare &&
      bare.use === "choice" &&
      !bare.day &&
      !bare.period
    ) {
      top[c] = top[c - 1];
    }
  }
  const columns = [];
  let usesRowAbove = false;
  for (let c = 0; c < width; c++) {
    const below = base[c] || "";
    const above = top[c] || "";
    let heading = below;
    let meaning = below ? headingMeaning(below) : null;
    if (above && below) {
      const both = headingMeaning(`${above} ${below}`);
      if (both && both.use === "choice") {
        heading = `${above} ${below}`;
        meaning = both;
        usesRowAbove = true;
      }
    } else if (above && !below) {
      heading = above;
      meaning = headingMeaning(above);
    }
    columns.push({ index: c, heading, meaning });
  }
  return { columns, usesRowAbove };
}

/** Whether a row of headings names a camper and holds choices. */
function isTable(columns) {
  const uses = columns.map((c) => c.meaning);
  const named =
    uses.some((m) => m && (m.use === "name" || m.use === "number")) ||
    (uses.some((m) => m && m.use === "firstName") &&
      uses.some((m) => m && m.use === "lastName"));
  return named && uses.some(isChoiceUse);
}

const SCAN = 12;

/**
 * The heading row of a sheet of campers: the first of its opening rows whose headings name a
 * camper and hold choices, or the row under it when that row reads as headings under it (a
 * two-row heading). Returns { row, firstRow, columns } (0-based; firstRow is where the heading
 * starts) or null.
 */
export function findTable(sheet) {
  const limit = Math.min(sheet.rows.length, SCAN);
  for (let r = 0; r < limit; r++) {
    const here = headingsAt(sheet, r);
    if (!isTable(here.columns)) continue;
    const next = r + 1 < sheet.rows.length ? headingsAt(sheet, r + 1) : null;
    if (next && next.usesRowAbove && isTable(next.columns)) {
      return { row: r + 1, firstRow: r, columns: next.columns };
    }
    return {
      row: r,
      firstRow: here.usesRowAbove ? r - 1 : r,
      columns: here.columns
    };
  }
  return null;
}
