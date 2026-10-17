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
  if (typeof value !== "string") {
    return value;
  }
  // Text already starting with an apostrophe before such a character keeps it: one more, which
  // reading takes off again ("'=x" stays "'=x").
  const guarded =
    FORMULA_START.test(value) ||
    (value.startsWith("'") && FORMULA_START.test(value.slice(1)));
  return guarded ? `'${value}` : value;
}

/** The apostrophe sanitizeCell added, taken off; "'Round the campfire" stays as it is. */
export function unescapeCell(value) {
  if (typeof value !== "string" || !value.startsWith("'")) {
    return value;
  }
  const rest = value.slice(1);
  const guarded =
    FORMULA_START.test(rest) ||
    (rest.startsWith("'") && FORMULA_START.test(rest.slice(1)));
  return guarded ? rest : value;
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
 * Names in a list cell: split on commas, semicolons, and line breaks, but not inside brackets
 * ("Bunk 1 (Juniors, Main)") or double quotes (a name with a comma: "\"Bunk 3, Boys\"").
 */
export function splitList(text) {
  const parts = [];
  let current = "";
  let depth = 0;
  let inQuotes = false;
  for (const ch of String(text)) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === "(") {
      depth++;
    } else if (!inQuotes && ch === ")") {
      depth = Math.max(0, depth - 1);
    }
    if (!inQuotes && depth === 0 && /[,;\n]/.test(ch)) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((part) => tidy(part)).filter((part) => part);
}

/** A name as a list cell writes it: in double quotes when it holds a comma or semicolon. */
export function listName(name) {
  return /[,;\n"]/.test(name) ? `"${String(name).replace(/"/g, "")}"` : name;
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
  "every weekday",
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
  f: "Friday",
  // Two-letter days ("Mo We Fr"), as calendars write them.
  mo: "Monday",
  we: "Wednesday",
  fr: "Friday",
  sa: "Saturday",
  su: "Sunday"
};
const TUE_OR_THU = "T";

/** The days one word names: ["Monday"], ["Monday", "Wednesday", "Friday"] for "MWF", or null. */
function dayWord(word) {
  // Periods only ("Wed.", "M.W.F"): any other character can't be read, never dropped.
  const w = word.toLowerCase().replace(/\./g, "");
  if (!/^[a-z]+$/.test(w)) {
    return null;
  }
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
 * A dash between two days that are not next to each other and don't span the week ("T-Th",
 * "Mon-Wed"): "ask" (a range, or just those two days?), or "range" to read it as a range.
 */
export const TWO_DAY_DASH = "ask";

const SHORT = (day) => day.slice(0, 3);

/** Every dash-like character (en, em, figure dash, Unicode and non-breaking hyphens, minus) as "-". */
export function plainDashes(text) {
  return String(text).replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
}
// "thru", "to": a range always. A character no one types, so a "~" in the cell stays unread.
const RANGE_WORD = "\uE000";
const SEPARATOR = new Set(["-", RANGE_WORD]);

/**
 * Days a cell names, Monday to Friday in order: "Monday, Wednesday", "Mon thru Fri", "M-F",
 * "Tue/Thu", "MWF", "Mon Wed Fri", "Mondays and Fridays", "weekdays".
 * - A lone T is Tuesday when the cell writes Thursday another way ("T/Th"), Thursday when it
 *   writes Tuesday another way, and otherwise asked ({ ask: "t" }) until said.t says.
 * - Two or more dashes are a list ("Mon-Wed-Fri"). One dash is a range when its days are next
 *   to each other or span the week ("Mon-Tue", "M-F"); otherwise asked ({ ask: "dash", from,
 *   to }) until said.dash is "range" or "list". "thru", "through", "to" are always ranges.
 * Saturday and Sunday can't be read: Shoresh camps run Monday to Friday.
 */
export function days(written, said = {}) {
  const text = plainDashes(written);
  if (EVERY_DAY.has(text.toLowerCase().replace(/\s*-\s*/g, "-"))) {
    return { value: [...WEEKDAYS] };
  }
  const parts = [];
  for (const part of text
    .split(/[,;/&+\n]|\band\b/i)
    .map(tidy)
    .filter((p) => p)) {
    const words = part
      .replace(/\b(?:thru|through|to|until|till)\b/gi, RANGE_WORD)
      .match(/[\uE000-]|[^\s\uE000-]+/g);
    const read = words.map((w) => (SEPARATOR.has(w) ? w : dayWord(w)));
    const bad = read.findIndex((d) => !d);
    if (bad >= 0) {
      return { problem: `"${words[bad]}" isn't a day` };
    }
    parts.push({ part, read, raw: words });
  }
  const all = parts.flatMap((p) => p.read).flat();
  const weekend = all.find(
    (d) => !SEPARATOR.has(d) && d !== TUE_OR_THU && !WEEKDAYS.includes(d)
  );
  if (weekend) {
    return { problem: `${weekend} isn't a camp day` };
  }
  // Each lone T in turn: two are Tuesday then Thursday ("MTWTF"); one follows the day the cell
  // writes another way, else the answer.
  const lone = all.filter((d) => d === TUE_OR_THU).length;
  const tue = all.includes("Tuesday");
  const thu = all.includes("Thursday");
  let meanings = [];
  if (lone === 2 && !tue && !thu) {
    meanings = ["Tuesday", "Thursday"];
  } else if (lone === 1) {
    const t = tue === thu ? said.t : tue ? "Thursday" : "Tuesday";
    if (!t) {
      return { ask: "t" };
    }
    meanings = [t];
  } else if (lone) {
    return { problem: `"${text}": which T is which?` };
  }
  const queue = [...meanings];
  const found = new Set();
  const unsure = [];
  for (const { part, read, raw } of parts) {
    const words = read.map((d) => {
      return Array.isArray(d)
        ? d.map((x) => (x === TUE_OR_THU ? queue.shift() : x))
        : d;
    });
    const read2 = readPart(part, words, raw, said);
    if (read2.problem) {
      return read2;
    }
    unsure.push(...read2.unsure);
    read2.picked.forEach((d) => found.add(d));
  }
  if (unsure.length) {
    return { ask: "dash", dashes: unsure };
  }
  // Only separators ("/", "and"): no days written, as if blank.
  return found.size
    ? { value: WEEKDAYS.filter((d) => found.has(d)) }
    : { blank: true };
}

/** One part of a days cell, its words read: { picked, unsure } or { problem }. */
function readPart(part, words, raw, said) {
  const picked = [];
  const seps = words.filter((w) => SEPARATOR.has(w));
  // A separator always has a day on each side.
  const stranded = words.some(
    (w, i) =>
      SEPARATOR.has(w) &&
      (i === 0 ||
        i === words.length - 1 ||
        SEPARATOR.has(words[i - 1]) ||
        SEPARATOR.has(words[i + 1]))
  );
  if (stranded) {
    return { problem: `"${part}" isn't a day` };
  }
  if (seps.length >= 2 && seps.every((w) => w === "-")) {
    // "Mon-Wed-Fri": a list, in order.
    const listed = words.filter((w) => !SEPARATOR.has(w)).flat();
    const index = listed.map((d) => WEEKDAYS.indexOf(d));
    if (index.some((x, i) => i && x < index[i - 1])) {
      return { problem: `"${part}" goes backwards` };
    }
    return { picked: listed, unsure: [] };
  }
  const unsure = [];
  for (let i = 0; i < words.length; i++) {
    if (!SEPARATOR.has(words[i])) {
      picked.push(...words[i]);
      continue;
    }
    const before = words[i - 1];
    const after = words[i + 1];
    const from = WEEKDAYS.indexOf(before[before.length - 1]);
    const to = WEEKDAYS.indexOf(after[0]);
    if (to < from) {
      return { problem: `"${part}" goes backwards` };
    }
    // Sure only when the days are next to each other or span the week; run-together letters
    // ("MW-F") are no surer than single days.
    const ambiguous =
      words[i] === "-" &&
      TWO_DAY_DASH === "ask" &&
      to - from > 1 &&
      !(from === 0 && to === WEEKDAYS.length - 1);
    const dash = `${raw[i - 1]}-${raw[i + 1]}`;
    const answer = (said.dashes || {})[dashKeyOf(dash)];
    if (ambiguous && answer === "list") {
      continue;
    }
    if (ambiguous && answer !== "range") {
      unsure.push({ text: dash, from: WEEKDAYS[from], to: WEEKDAYS[to] });
    }
    picked.push(...WEEKDAYS.slice(from, to + 1));
  }
  return { picked, unsure };
}

/** A dash as written, for its own question: "M-W" and "m - w" are one. */
export function dashKeyOf(dash) {
  return tidy(plainDashes(dash)).toLowerCase().replace(/\s+/g, "");
}

/** The two answers a dash question offers: "Tue to Thu", "Just Tue and Thu". */
export function dashLabels(from, to) {
  return {
    range: `${SHORT(from)} to ${SHORT(to)}`,
    list: `Just ${SHORT(from)} and ${SHORT(to)}`
  };
}

/**
 * A clock time: minutes after midnight. Without AM or PM, 7 to 11 is the morning and 12 to 4 the
 * afternoon (Shoresh is for day camps); 5 and 6 o'clock are asked, never guessed (ADR 0006).
 */
function time(text) {
  if (/^\d{1,2}$/.test(text)) {
    return bareHour(Number(text), text);
  }
  // One time and nothing else: "9:00", "9.30am", "9:30 a.m.". A stray "-" or a lone "p" can't
  // be read (coordinator, #20 round 4).
  const single = /^\d{1,2}(?:[:.]\d{2})?\s*(?:[ap]\.?\s*m\.?)?$/i.test(text);
  const range = single && timeRange(text);
  if (!range || range.end !== null) {
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

/** "9": 9:00 AM. 7 to 11 is the morning, 12 to 4 the afternoon, 5 and 6 asked. */
function bareHour(hour, text) {
  if (hour < 1 || hour > 23) {
    return { problem: `"${text}" isn't a camp-day time` };
  }
  if (hour >= 13) {
    // A bare 13 to 23 is outside the camp-day rule (ADR 0007 §14); "8 PM" written out is read.
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
  if (column.keepSpacing) {
    // Notes keep their line breaks and spaces, as written.
    const kept = String(unescapeCell(raw ?? "")).replace(/\r\n?/g, "\n");
    return text ? { value: kept } : { blank: true };
  }
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
