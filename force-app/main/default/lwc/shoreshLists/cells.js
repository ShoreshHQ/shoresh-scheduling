/*
 * Reading one cell of a setup list (slice 4c). A cell gives a value, is blank, or can't be read,
 * and then says why: nothing is quietly turned into a default (the desktop read "Yes" in an
 * Outdoors column as false, and an unknown availability as "all").
 *
 * The spreadsheet-formula guard is Shoresh desktop's src/utils/exportSanitize.js (Apache-2.0,
 * see NOTICE): a text cell that starts with = + - @ or a tab or line break is written with an
 * apostrophe in front, and the apostrophe is taken off again when the file is read back.
 */
import { WEEKDAYS, dayOf, tidy } from "c/shoreshImportEngine";

const FORMULA_START = /^[=+\-@\t\r\n]/;

/** A text cell made safe to open in a spreadsheet program (numbers are left alone). */
export function sanitizeCell(value) {
  return typeof value === "string" && FORMULA_START.test(value)
    ? `'${value}`
    : value;
}

/** The apostrophe sanitizeCell added, taken off; "'Round the campfire" stays as it is. */
export function unescapeCell(value) {
  return typeof value === "string" &&
    value.startsWith("'") &&
    FORMULA_START.test(value.slice(1))
    ? value.slice(1)
    : value;
}

/** "No maximum", "No limit": a number column that can also say there is none. */
export const NONE = "none";

const YES = new Set(["yes", "y", "true", "1", "x", "✓", "✔"]);
const NO = new Set(["no", "n", "false", "0"]);
const NONE_WORDS = new Set([
  "none",
  "no limit",
  "no max",
  "no maximum",
  "unlimited"
]);
const EVERYONE = new Set(["everyone", "everybody", "all", "all groups"]);

function quoted(raw) {
  return `"${tidy(raw)}"`;
}

function whole(text, min) {
  if (!/^\d+(\.0+)?$/.test(text)) {
    return { problem: `${quoted(text)} is not a whole number` };
  }
  const value = Number(text);
  return value < min
    ? { problem: `${quoted(text)}: must be ${min} or more` }
    : { value };
}

/**
 * Names in a list cell: split on commas, semicolons, and line breaks, but not inside brackets,
 * so "Bunk 1 (Juniors, Main)" stays one name.
 */
export function splitList(text) {
  const parts = [];
  let current = "";
  let depth = 0;
  for (const ch of String(text)) {
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    }
    if (depth === 0 && /[,;\n]/.test(ch)) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((part) => tidy(part)).filter((part) => part);
}

/** "2 by Wednesday", "2 by Wed": how many early in the week, by which day. */
function early(text) {
  const match = text.match(/^(\d+)\s*(?:times?\s*)?(?:by|before)?\s+(.+)$/i);
  const day = match ? dayOf(match[2]) : null;
  if (!match || !day) {
    return {
      problem: `${quoted(text)}: write it as a number and a day, like "2 by Wednesday"`
    };
  }
  if (!WEEKDAYS.includes(day)) {
    return { problem: `${quoted(text)}: ${day} is not a camp day` };
  }
  const count = whole(match[1], 1);
  return count.problem ? count : { value: { count: count.value, day } };
}

/**
 * One cell, read for its column: { value }, { blank: true }, or { problem } (the reason, shown
 * with the row). column.type: text, ref, whole, wholeOrNone, yesNo, choice, list, early.
 */
export function readCell(column, raw) {
  const text = tidy(unescapeCell(raw));
  if (column.type === "yesNo") {
    // A blank tick column is No, as an unticked box is.
    const word = text.toLowerCase();
    if (!text || NO.has(word)) {
      return { value: false };
    }
    return YES.has(word)
      ? { value: true }
      : { problem: `${quoted(text)}: write Yes or No` };
  }
  if (!text) {
    return { blank: true };
  }
  switch (column.type) {
    case "whole":
      return whole(text, column.min || 0);
    case "wholeOrNone":
      return NONE_WORDS.has(text.toLowerCase())
        ? { value: NONE }
        : whole(text, column.min || 0);
    case "choice": {
      const found = column.options.find((option) =>
        [option.value, option.label, ...(option.words || [])].some(
          (word) => word.toLowerCase() === text.toLowerCase()
        )
      );
      return found
        ? { value: found.value }
        : {
            problem: `${quoted(text)}: write ${column.options
              .map((o) => o.label)
              .join(" or ")}`
          };
    }
    case "list":
      return EVERYONE.has(text.toLowerCase())
        ? { value: [] }
        : { value: splitList(text) };
    case "early":
      return early(text);
    default:
      return { value: text };
  }
}
