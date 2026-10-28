/*
 * Which week a page, a file or a row is for (docs/import/weeks.md, INGEST-4.1 and 4.2): "Week 2",
 * "Wk 2", "W2", "Session 1", or a date ("Week of 7/6"), read as one label the rest of the import
 * keys weeks by.
 */
import { dayOf, tidy } from "./text";

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec"
];

// "Week 2", "Week #2", "Wk 2", "Wk.2", "W2".
const NUMBERED = /\b(?:week|wk\.?)\s*#?\s*(\d{1,2})\b|\bw(\d{1,2})\b/i;
const SESSION = /\bsession\s*#?\s*(\d{1,2})\b/i;
// 7/6, 7-6, 7/6/2026, 7.6.26; 2026-07-06; July 6, Jul 6th.
const SLASHED = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?\b/;
const ISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;
const SPELLED =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
const WEEK_OF = /\bweek\s+(?:of|starting|beginning|commencing)\b/i;

function validDay(month, day) {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** A date in the text as { month, day }, or null. */
export function dateIn(text) {
  const value = tidy(text);
  const iso = value.match(ISO);
  if (iso && validDay(Number(iso[2]), Number(iso[3]))) {
    return { month: Number(iso[2]), day: Number(iso[3]) };
  }
  const slashed = value.match(SLASHED);
  if (slashed && validDay(Number(slashed[1]), Number(slashed[2]))) {
    return { month: Number(slashed[1]), day: Number(slashed[2]) };
  }
  const spelled = value.match(SPELLED);
  if (spelled) {
    const month = MONTHS.indexOf(spelled[1].slice(0, 3).toLowerCase()) + 1;
    if (validDay(month, Number(spelled[2]))) {
      return { month, day: Number(spelled[2]) };
    }
  }
  return null;
}

function dateLabel(date) {
  return `Week of ${date.month}/${date.day}`;
}

/** The date a "Week of 7/6" label names, as { month, day }, or null. */
export function labelDate(label) {
  return /^Week of \d/.test(label || "") ? dateIn(label) : null;
}

function namesADay(text) {
  return tidy(text)
    .split(/[^A-Za-z]+/)
    .some((w) => w.length >= 3 && dayOf(w));
}

/**
 * "Week 3" from a title that names a week ("Week 3", "Wk3", "W3"), "Session 1" from one naming
 * a session, "Week of 7/6" from "Week of July 6"; null otherwise. A bare date counts only when
 * `bareDates` is set and the text names no day ("Monday 6/30" is that day's date).
 */
export function weekInTitle(title, bareDates) {
  const text = tidy(title);
  const numbered = text.match(NUMBERED);
  if (numbered) {
    return `Week ${Number(numbered[1] || numbered[2])}`;
  }
  const session = text.match(SESSION);
  if (session) {
    return `Session ${Number(session[1])}`;
  }
  const date = dateIn(text);
  if (date && (WEEK_OF.test(text) || (bareDates && !namesADay(text)))) {
    return dateLabel(date);
  }
  return null;
}

/** A file's name as a week: as a title, and a bare date too ("Camp - 7-6-2026"). */
export function weekInFileName(name) {
  return weekInTitle(name, true);
}

/** A title without the week it names: "Week 2 - Bunk 1" -> "Bunk 1", "Wk2 Bunk 1" -> "Bunk 1". */
export function withoutWeek(title) {
  return tidy(
    tidy(title)
      .replace(NUMBERED, " ")
      .replace(SESSION, " ")
      .replace(WEEK_OF, " ")
      .replace(ISO, " ")
      .replace(SLASHED, " ")
      .replace(SPELLED, " ")
      .replace(/^[\s\-–—_:,]+|[\s\-–—_:,]+$/g, "")
  );
}

// The heading of a column that says which week each row is for.
const WEEK_HEADING =
  /^(weeks?|wk|week\s*#|week\s*(no\.?|number)|sessions?|week\s+(of|starting|beginning)|dates?|week\s+dates?)$/i;

/** Whether a column heading names a week column ("Week", "Wk", "Session", "Week of", "Dates"). */
export function isWeekHeading(text) {
  return WEEK_HEADING.test(tidy(text));
}

/**
 * A cell of a week column as a week label: "Week 2", "2" (under "Week"; "Session 2" under
 * "Session"), "Wk 2", a date ("7/6", "July 6"). null if it is none of these.
 */
export function weekValue(text, heading) {
  const value = tidy(text);
  if (/^\d{1,2}$/.test(value)) {
    return /^session/i.test(tidy(heading))
      ? `Session ${Number(value)}`
      : `Week ${Number(value)}`;
  }
  return weekInTitle(value, true);
}
