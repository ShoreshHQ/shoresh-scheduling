/*
 * Reading the text of one spreadsheet cell: times, days, and names.
 *
 * Parts adapted from Shoresh desktop (https://github.com/gfeitel1-maker/Scheduling-Project-,
 * Apache-2.0): src/ingest/orderTimeBlocks.js (the camp-day rule for times without AM or PM),
 * src/ingest/extractEntities.js (cleanCellValue, splitUnitAndGroup, splitDivisionWord),
 * src/ingest/workbookToSource.js (Excel fractions of a day), src/ingest/scheduleShape.js
 * (day abbreviations). See the NOTICE file at the repository root.
 */

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday"
];
const ALL_DAYS = ["Sunday", ...WEEKDAYS, "Saturday"];
const DAY_ALIASES = {
  weds: "Wednesday",
  tues: "Tuesday",
  thur: "Thursday",
  thurs: "Thursday"
};

/** Spaces collapsed and trimmed. */
export function tidy(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}

/** The key two spellings share when they differ only in capitals and spacing. */
export function looseKey(value) {
  return tidy(value).toLowerCase();
}

/**
 * The day a word names, written in full or shortened ("Mon", "Tues", "WED."), or null.
 * Two letters at least, so a column called "S" or "M" is not taken for a day.
 */
export function dayOf(text) {
  const word = tidy(text)
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (word.length < 2) {
    return null;
  }
  if (DAY_ALIASES[word]) {
    return DAY_ALIASES[word];
  }
  if (word.length < 3) {
    return null;
  }
  return ALL_DAYS.find((day) => day.toLowerCase().startsWith(word)) || null;
}

/** The first day a title names among its words ("Monday - All Camp", "Week 2 Tue"), or null. */
export function dayInTitle(title) {
  for (const word of tidy(title).split(/[^A-Za-z]+/)) {
    const day = word.length >= 3 ? dayOf(word) : null;
    if (day) {
      return day;
    }
  }
  return null;
}

/** "Week 3" from a title or file name that names a week, or null. */
export function weekInTitle(title) {
  const match = tidy(title).match(/\bweek\s*#?\s*(\d{1,2})\b/i);
  return match ? `Week ${Number(match[1])}` : null;
}

/** A title without the week it names: "Week 2 - Bunk 1" -> "Bunk 1". */
export function withoutWeek(title) {
  return tidy(
    tidy(title)
      .replace(/\bweek\s*#?\s*\d{1,2}\b/i, " ")
      .replace(/^[\s\-–—_:,]+|[\s\-–—_:,]+$/g, "")
  );
}

// Excel stores a time as a fraction of a day: 9:15am is 0.3854166666666667.
const FRACTION_OF_A_DAY = /^0?\.\d{6,}$/;

/** One cell as text. A bare Excel time (a fraction of a day) becomes "9:15". */
export function cellText(value) {
  const text = tidy(value);
  if (!FRACTION_OF_A_DAY.test(text)) {
    return text;
  }
  const minutes = Math.round(Number(text) * 24 * 60);
  return `${Math.floor(minutes / 60) % 24}:${String(minutes % 60).padStart(2, "0")}`;
}

// ---------- times ----------

const TIME = /(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|a|p)?(?![a-z\d])/i;
const TIME_GLOBAL = new RegExp(TIME.source, "gi");
const CLOCK = /\d{1,2}[:.]\d{2}|\d{1,2}\s*(am|pm|a\.m\.|p\.m\.)/i;

// A day camp's day (desktop orderTimeBlocks.js): a bare hour from 1 to 6 is the afternoon, 7 to
// 11 the morning, 12 noon. Only an hour of 13 or more is unambiguous 24-hour notation.
const MORNING_FROM_HOUR = 7;

function minutesOf(hourText, minuteText, meridiem, inheritPm) {
  const hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (hour > 23 || minute > 59) {
    return null;
  }
  const mark = meridiem ? meridiem.toLowerCase().charAt(0) : null;
  if (mark) {
    return ((hour % 12) + (mark === "p" ? 12 : 0)) * 60 + minute;
  }
  if (hour >= 13 || hour === 0) {
    return hour * 60 + minute;
  }
  if (inheritPm !== undefined && inheritPm !== null) {
    return ((hour % 12) + (inheritPm ? 12 : 0)) * 60 + minute;
  }
  const afternoon = hour < MORNING_FROM_HOUR;
  return (afternoon ? hour + 12 : hour) * 60 + minute;
}

/** Whether the text holds a clock time ("9:00", "9am", "13:30"). */
export function hasClockTime(text) {
  return CLOCK.test(tidy(text));
}

// What follows a bare hour that starts a range: "9 - 9:45", "9-10am", "1 to 2pm".
const RANGE_NEXT =
  /^\s*(?:-|–|—|to)\s*\d{1,2}(?:[:.]\d{2}|\s*(?:a\.?m\.?|p\.?m\.?|a|p)(?![a-z]))/i;

function timeTokens(text) {
  const tokens = [];
  const clean = tidy(text);
  for (const match of clean.matchAll(TIME_GLOBAL)) {
    // A bare number with no minutes and no AM/PM is not a time ("Period 2"), unless it starts
    // a range whose other end is one ("9 - 9:45", "1-2pm").
    const startsRange = RANGE_NEXT.test(
      clean.slice(match.index + match[0].length)
    );
    if (match[2] || match[3] || (tokens.length === 0 && startsRange)) {
      tokens.push(match);
    }
  }
  return tokens;
}

/**
 * The start and end a label gives, as minutes after midnight: "9:00-9:45", "9 - 9:45am",
 * "1:30 – 2:15 PM", "Period 1 (9:00-9:45)". The end is null when only a start is written.
 * Returns null when the label holds no time.
 */
export function timeRange(text) {
  const tokens = timeTokens(text);
  if (tokens.length === 0) {
    return null;
  }
  const [first, second] = tokens;
  // "1:30 - 2:15 PM": the PM written once covers both ends.
  const endMark =
    second && second[3] ? second[3].toLowerCase().charAt(0) : null;
  const firstMark = first[3] ? null : endMark;
  let start = minutesOf(
    first[1],
    first[2],
    first[3],
    firstMark ? firstMark === "p" : undefined
  );
  let end = second ? minutesOf(second[1], second[2], second[3]) : null;
  if (start !== null && end !== null && firstMark === "p" && start > end) {
    // "11:30 - 12:15 PM": the start is still the morning.
    start -= 12 * 60;
  }
  if (start !== null && end !== null && end <= start && !second[3]) {
    end = minutesOf(second[1], second[2], start >= 12 * 60 ? "p" : null);
  }
  if (start === null) {
    return null;
  }
  return { start, end: end !== null && end > start ? end : null };
}

/** The label with its times taken out: "Period 1 (9:00-9:45)" -> "Period 1". */
export function withoutTimes(text) {
  let marked = tidy(text);
  for (const token of timeTokens(marked)) {
    marked = marked.replace(token[0], "\u2063");
  }
  return tidy(
    marked.replace(/\(?\s*\u2063\s*(?:(?:-|–|—|to)\s*\u2063?)?\s*\)?/g, " ")
  ).replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, "");
}

/** "HH:mm" for minutes after midnight. */
export function clock(minutes) {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "9:00" / "1:30" for screens: 12-hour, no AM or PM (as camp schedules write it). */
export function shortClock(minutes) {
  const hours = Math.floor(minutes / 60) % 12 || 12;
  return `${hours}:${String(minutes % 60).padStart(2, "0")}`;
}

const NAMED_BLOCK =
  /^(period|block|session|activity|perek|chug)\s*\d+[a-z]?\b/i;

/** Whether a row label names a time block: it holds a time, or reads "Period 3", "Block 2". */
export function looksLikeBlockLabel(text) {
  const label = tidy(text);
  return !!label && (!!timeRange(label) || NAMED_BLOCK.test(label));
}

// ---------- names in cells ----------

// Not activities: a time on its own, "Block 2", a bare number, dashes, "Open".
const NOT_A_NAME = [
  /^\d{1,2}[:.]\d{2}/,
  /^(block|period)\s*\d*$/i,
  /^\d+$/,
  /^[-–—.\s?x]*$/i,
  /^(open|free|tbd|tba|n\/a|none)$/i,
  // Passing time between blocks (desktop periodSpan.js PASSING_TIME).
  /^(change|changeover|change[\s-]over|transition|passing(\s+time)?)[\s.!:]*$/i
];

/**
 * What a cell names, and where, if it says: "Swim (Pool)" -> { name: "Swim", place: "Pool" },
 * "Art @ Art room" -> { name: "Art", place: "Art room" }. Times written in the cell are left out
 * of the name ("Lunch 12:00" is Lunch). Null for an empty cell or one that names nothing.
 */
export function cellName(value) {
  let text = tidy(value);
  let place = null;
  const at = text.match(/^(.+?)\s+@\s+(.+)$/);
  const bracket = text.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (at) {
    text = at[1];
    place = tidy(at[2]);
  } else if (bracket && !hasClockTime(bracket[2])) {
    text = bracket[1];
    place = tidy(bracket[2]);
  }
  const name = withoutTimes(text).replace(/^[\s\-–—:*]+|[\s\-–—:*]+$/g, "");
  if (name.length < 2 || NOT_A_NAME.some((pattern) => pattern.test(name))) {
    return null;
  }
  return { name, place: place || null };
}

/**
 * Group names listed in one cell of a by-activity schedule: "Bunk 1, Bunk 2", "Bunk 1 / Bunk 2",
 * one per line, or "Bunk 1 & Bunk 2". Not on "and", which can be part of a group's name.
 */
export function listedNames(value) {
  return String(value === null || value === undefined ? "" : value)
    .split(/\s*(?:[,;/\n]|\s&\s|\s\+\s)\s*/i)
    .map((part) => tidy(part))
    .filter((part) => part.length > 0 && !NOT_A_NAME.some((p) => p.test(part)));
}

// ---------- divisions from group names ----------

/**
 * A division named in a group's title (desktop splitUnitAndGroup and splitDivisionWord):
 * "Juniors - Bunk 1" -> { division: "Juniors", group: "Bunk 1" }; "Yeladim 3" ->
 * { division: "Yeladim", group: "Yeladim 3" }. The separator needs a space on one side, so
 * "2-3A" stays one group. Returns { division: null, group } when the title names none.
 */
export function divisionInTitle(title) {
  const text = tidy(title);
  const split = text.match(/^(.+?)(?:\s+[-–—:]\s*|[-–—:]\s+)(.+)$/);
  if (split && split[1].length >= 2 && /[A-Za-z]/.test(split[1])) {
    return { division: tidy(split[1]), group: tidy(split[2]) };
  }
  const numbered = text.match(/^([\p{L}][\p{L}\s']*?)\s+(\d+[A-Za-z]?)$/u);
  if (numbered && !/^(bunk|group|cabin|tent|team)$/i.test(tidy(numbered[1]))) {
    return { division: tidy(numbered[1]), group: text };
  }
  return { division: null, group: text };
}

// Columns that are never groups (desktop NON_GROUP_HEADERS).
const NOT_GROUP_HEADERS = new Set([
  "notes",
  "note",
  "staff",
  "total",
  "totals",
  "time",
  "times",
  "period",
  "periods",
  "location",
  "locations",
  "room",
  "tbd",
  "n/a",
  "day",
  "block",
  "blocks"
]);

export function isNotAGroupColumn(header) {
  return NOT_GROUP_HEADERS.has(looseKey(header));
}
