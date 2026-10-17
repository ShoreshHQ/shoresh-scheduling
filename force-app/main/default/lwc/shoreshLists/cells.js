/*
 * Reading one cell of a setup list (slice 4c). A cell gives a value, is blank, or can't be read,
 * and then says why: nothing is quietly turned into a default (the desktop read "Yes" in an
 * Outdoors column as false, and an unknown availability as "all").
 *
 * The spreadsheet-formula guard is Shoresh desktop's src/utils/exportSanitize.js (Apache-2.0,
 * see NOTICE): a text cell that starts with = + - @ or a tab or line break is written with an
 * apostrophe in front, and the apostrophe is taken off again when the file is read back.
 */
import { WEEKDAYS, dayOf, tidy, timeRange } from "c/shoreshImportEngine";

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
    ? { problem: `${quoted(text)} is below ${min}` }
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
      problem: `${quoted(text)} isn't like "2 by Wednesday"`
    };
  }
  if (!WEEKDAYS.includes(day)) {
    return { problem: `${day} isn't a camp day` };
  }
  const count = whole(match[1], 1);
  return count.problem ? count : { value: { count: count.value, day } };
}

const EVERY_DAY = new Set([
  "weekdays",
  "every day",
  "everyday",
  "daily",
  "all",
  "all week",
  "mon-fri",
  "monday-friday",
  "monday to friday"
]);

/** Day letters, read only in a days cell: M, Tu, W, Th, F. A lone T is asked (TUE_OR_THU). */
const LETTERS = {
  m: "Monday",
  tu: "Tuesday",
  w: "Wednesday",
  th: "Thursday",
  f: "Friday"
};
const TUE_OR_THU = "T";

/** The days one word names: ["Monday"], ["Monday", "Wednesday", "Friday"] for "MWF", or null. */
function dayWord(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w === "t") {
    return [TUE_OR_THU];
  }
  if (LETTERS[w]) {
    return [LETTERS[w]];
  }
  // "Wednesdays", "Mondays".
  const day =
    dayOf(w) || (w.length > 3 && w.endsWith("s") && dayOf(w.slice(0, -1)));
  if (day) {
    return [day];
  }
  // Run together: "MWF", "MTWThF", "TTh".
  return /^(?:th|tu|m|t|w|f)+$/.test(w)
    ? w
        .match(/th|tu|m|t|w|f/g)
        .map((l) => (l === "t" ? TUE_OR_THU : LETTERS[l]))
    : null;
}

/**
 * Days a cell names, Monday to Friday in order: "Monday, Wednesday", "Mon-Wed", "Mon thru Fri",
 * "Tue/Thu", "MWF", "M-F", "Mon Wed Fri", "Mondays and Fridays", "weekdays". A lone T is
 * Tuesday when the cell writes Thursday another way ("T/Th"), Thursday when it writes Tuesday
 * another way, and otherwise asked: { ask: true } until tIs ("Tuesday" or "Thursday") says.
 * Saturday and Sunday can't be read: Shoresh camps run Monday to Friday.
 */
export function days(text, tIs) {
  if (EVERY_DAY.has(text.toLowerCase().replace(/\s*([-–])\s*/g, "-"))) {
    return { value: [...WEEKDAYS] };
  }
  const parts = [];
  for (const part of text
    .split(/[,;/&+\n]|\band\b/i)
    .map(tidy)
    .filter((p) => p)) {
    const words = part
      .replace(/\b(?:thru|through|to|until|till)\b/gi, "-")
      .match(/[–-]|[^\s–-]+/g);
    const read = words.map((w) => (/^[–-]$/.test(w) ? "-" : dayWord(w)));
    const bad = read.findIndex((d) => !d);
    if (bad >= 0) {
      return { problem: `"${words[bad]}" isn't a day` };
    }
    parts.push({ part, read });
  }
  const written = parts.flatMap((p) => p.read).flat();
  const weekend = written.find(
    (d) => d !== "-" && d !== TUE_OR_THU && !WEEKDAYS.includes(d)
  );
  if (weekend) {
    return { problem: `${weekend} isn't a camp day` };
  }
  // Each lone T in turn: two are Tuesday then Thursday ("MTWTF"); one follows the day the cell
  // writes another way, else the answer.
  const lone = written.filter((d) => d === TUE_OR_THU).length;
  const tue = written.includes("Tuesday");
  const thu = written.includes("Thursday");
  let meanings = [];
  if (lone === 2 && !tue && !thu) {
    meanings = ["Tuesday", "Thursday"];
  } else if (lone === 1) {
    const t = tue === thu ? tIs : tue ? "Thursday" : "Tuesday";
    if (!t) {
      return { ask: true };
    }
    meanings = [t];
  } else if (lone) {
    return { problem: `"${text}": which T is which?` };
  }
  const queue = [...meanings];
  const found = new Set();
  for (const { part, read } of parts) {
    const words = read.map((d) => {
      return Array.isArray(d)
        ? d.map((x) => (x === TUE_OR_THU ? queue.shift() : x))
        : d;
    });
    for (let i = 0; i < words.length; i++) {
      if (words[i] !== "-") {
        words[i].forEach((d) => found.add(d));
        continue;
      }
      const before = words[i - 1];
      const after = words[i + 1];
      if (!Array.isArray(before) || !Array.isArray(after)) {
        return { problem: `"${part}" isn't a day` };
      }
      const from = WEEKDAYS.indexOf(before[before.length - 1]);
      const to = WEEKDAYS.indexOf(after[0]);
      if (to < from) {
        return { problem: `"${part}" goes backwards` };
      }
      WEEKDAYS.slice(from, to + 1).forEach((d) => found.add(d));
    }
  }
  // Only separators ("/", "and"): no days written, as if blank.
  return found.size
    ? { value: WEEKDAYS.filter((d) => found.has(d)) }
    : { blank: true };
}

/**
 * A clock time: minutes after midnight. Without AM or PM, 7 to 11 is the morning and 12 to 4 the
 * afternoon (Shoresh is for day camps); 5 and 6 o'clock are asked, never guessed (ADR 0006).
 */
function time(text) {
  if (/^\d{1,2}$/.test(text)) {
    return bareHour(Number(text), text);
  }
  const range = timeRange(text);
  if (!range || range.end !== null || !/\d/.test(text)) {
    return { problem: `"${text}" isn't a time` };
  }
  const hour = Number((text.match(/\d{1,2}/) || ["0"])[0]);
  const meridiem = /[ap]\.?\s*m\.?/i.test(text);
  // A camp day: never "15:00 AM", and nothing between midnight and 5 in the morning.
  if ((meridiem && (hour > 12 || hour === 0)) || range.start < 5 * 60) {
    return { problem: `"${text}" isn't a camp-day time` };
  }
  const marked = meridiem || hour >= 13;
  return !marked && (hour === 5 || hour === 6)
    ? { value: range.start, unsure: true }
    : { value: range.start };
}

/** "9": 9:00 AM. 7 to 11 is the morning, 12 to 4 the afternoon, 5 and 6 asked, 13 to 23 as on a 24-hour clock. */
function bareHour(hour, text) {
  if (hour < 1 || hour > 23) {
    return { problem: `"${text}" isn't a camp-day time` };
  }
  if (hour >= 7) {
    return { value: hour * 60 };
  }
  // 1 to 6: the afternoon; 5 and 6 read as evening until asked.
  return hour >= 5
    ? { value: (hour + 12) * 60, unsure: true }
    : { value: (hour + 12) * 60 };
}

/**
 * One cell, read for its column: { value }, { blank: true }, or { problem } (the reason, shown
 * with the row). column.type: text, ref, whole, wholeOrNone, yesNo, choice, list, early, days,
 * time ({ value, unsure } for a 5 or 6 o'clock time without AM or PM).
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
      : { problem: `${quoted(text)} isn't Yes or No` };
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
            problem: `${quoted(text)} isn't ${column.options
              .map((o) => o.label)
              .join(" or ")}`
          };
    }
    case "list":
      // Split before tidying: a line break inside the cell (Alt+Enter) separates names too.
      return EVERYONE.has(text.toLowerCase())
        ? { value: [] }
        : { value: splitList(String(unescapeCell(raw))) };
    case "early":
      return early(text);
    case "days":
      return days(text);
    case "time":
      return time(text);
    default:
      return { value: text };
  }
}
