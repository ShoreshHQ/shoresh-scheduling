/*
 * Which week a page, a file or a row is for (docs/import/weeks.md, INGEST-4.1 and 4.2): "Week 2",
 * "Wk 2", "W2", "Session 1", or a date ("Week of 7/6", "Week of Jul 6"), read as one label the
 * rest of the import keys weeks by. Only what surely names a week counts: a range in a group's
 * name ("Grades 3-5", "Swim 7-6") or a bare "W2" beside a group's words is not a week, and the
 * name is kept whole.
 */
import { dayOf, tidy } from "./engine.shoreshImportEngine.text.mjs";

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
const MONTH_NAMES = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(
  " "
);

// "Week 2", "Week #2", "Wk 2", "Wk.2".
const WORDED = /\b(?:week|wk\.?)\s*#?\s*(\d{1,2})\b/i;
// "W2": a week only alone (INGEST-4.2).
const BARE_W = /\bw(\d{1,2})\b/i;
const SESSION = /\bsession\s*#?\s*(\d{1,2})\b/i;
// 7/6/2026, 7-6-26: a full date, with its year.
const WITH_YEAR = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/;
// 7/6, 7-6: a date only beside the word week (a range otherwise: "Grades 3-5").
const PAIR = /\b(\d{1,2})[/-](\d{1,2})\b/;
const ISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;
const SPELLED =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
const WEEK_OF = /\bweek\s+(?:of|starting|beginning|commencing)\b/i;
const WEEK_WORD = /\b(?:weeks?|wk)\b/i;
// Words that make a name a group's, never a bare week ("Bunk W2", "W12 Girls").
const GROUPISH =
  /\b(bunks?|cabins?|groups?|tents?|teams?|grades?|ages?|units?|girls|boys|juniors?|seniors?|inters?|divisions?|kids|campers?|counsell?ors?|staff)\b/i;
// With no season weeks to count, a bare W is a week up to this.
const MOST_WEEKS = 12;

function validDay(month, day) {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function namesADay(text) {
  return tidy(text)
    .split(/[^A-Za-z]+/)
    .some((w) => w.length >= 3 && dayOf(w));
}

/** A spelled-out or year-first date: one reading only. "Week of Jul 6". */
function sureDate(text) {
  const iso = text.match(ISO);
  if (iso && validDay(Number(iso[2]), Number(iso[3]))) {
    return { label: monthLabel(Number(iso[2]), Number(iso[3])), part: iso[0] };
  }
  const spelled = text.match(SPELLED);
  if (spelled) {
    const month = MONTHS.indexOf(spelled[1].slice(0, 3).toLowerCase()) + 1;
    if (validDay(month, Number(spelled[2]))) {
      return { label: monthLabel(month, Number(spelled[2])), part: spelled[0] };
    }
  }
  return null;
}

function monthLabel(month, day) {
  return `Week of ${MONTH_NAMES[month - 1]} ${day}`;
}

/** Numbers only ("7/6"): read month first; INGEST-4.7 tries day first too when it could be. */
function numberDate(text, pairs) {
  const full = text.match(WITH_YEAR);
  const found = full || (pairs ? text.match(PAIR) : null);
  const [a, b] = found ? [Number(found[1]), Number(found[2])] : [0, 0];
  if (found && (validDay(a, b) || validDay(b, a))) {
    return {
      label: `Week of ${Number(found[1])}/${Number(found[2])}`,
      part: found[0]
    };
  }
  return null;
}

/**
 * A bare "W2" is a week only when nothing else in the name looks like a group (no group word,
 * no other small number) and the number is one of the season's weeks (INGEST-4.2).
 */
function bareWeek(text, maxWeek) {
  const found = text.match(BARE_W);
  if (!found) {
    return null;
  }
  const n = Number(found[1]);
  const rest = text.replace(found[0], " ");
  const groupLike = GROUPISH.test(rest) || /\b\d{1,2}\b/.test(rest);
  return n >= 1 && n <= (maxWeek || MOST_WEEKS) && !groupLike
    ? { label: `Week ${n}`, part: found[0] }
    : null;
}

/**
 * What in a text names its week: { label, parts } or null. A name with both a session and a
 * week ("Session 2 Week 1") is labelled with both, so it is asked (INGEST-4.5).
 * options: { bareDates: a file name (a date alone counts, if no day is named), column: a week
 * column's cell (a date of numbers alone counts), maxWeek: the season's weeks }.
 */
function weekMatch(title, options = {}) {
  const text = tidy(title);
  const worded = text.match(WORDED);
  const session = text.match(SESSION);
  if (worded && session) {
    return {
      label: `Session ${Number(session[1])}, Week ${Number(worded[1])}`,
      parts: [session[0], worded[0]]
    };
  }
  if (worded) {
    return { label: `Week ${Number(worded[1])}`, parts: [worded[0]] };
  }
  if (session) {
    return { label: `Session ${Number(session[1])}`, parts: [session[0]] };
  }
  const weekWord = WEEK_OF.test(text) || WEEK_WORD.test(text);
  const dateAllowed =
    weekWord || options.column || (options.bareDates && !namesADay(text));
  const date = dateAllowed
    ? sureDate(text) || numberDate(text, weekWord || options.column)
    : null;
  if (date) {
    return { label: date.label, parts: [date.part] };
  }
  const bare = bareWeek(text, options.maxWeek);
  return bare ? { label: bare.label, parts: [bare.part] } : null;
}

/**
 * "Week 3" from a title that names a week ("Week 3", "Wk3", a lone "W3"), "Session 1" from one
 * naming a session, "Week of Jul 6" from "Week of July 6"; null otherwise.
 */
export function weekInTitle(title, options) {
  const found = weekMatch(title, options);
  return found ? found.label : null;
}

/** A file's name as a week: as a title, and a full date too ("Camp - 7-6-2026"). */
export function weekInFileName(name, maxWeek) {
  return weekInTitle(name, { bareDates: true, maxWeek });
}

/**
 * The dates a "Week of" label may mean, as [{ month, day }]: one for "Week of Jul 6"; for
 * numbers only ("Week of 7/6") July 6, and June 7 when it could be either (INGEST-4.7). [] for
 * any other label.
 */
export function labelDates(label) {
  const spelled = /^Week of ([A-Z][a-z]{2}) (\d{1,2})$/.exec(label || "");
  if (spelled) {
    return [
      { month: MONTH_NAMES.indexOf(spelled[1]) + 1, day: Number(spelled[2]) }
    ];
  }
  const numbers = /^Week of (\d{1,2})\/(\d{1,2})$/.exec(label || "");
  if (!numbers) {
    return [];
  }
  const [a, b] = [Number(numbers[1]), Number(numbers[2])];
  const result = [{ month: a, day: b }];
  if (a !== b && validDay(b, a)) {
    result.push({ month: b, day: a });
  }
  return result.filter((d) => validDay(d.month, d.day));
}

/** A title without the week it names: "Week 2 - Bunk 1" -> "Bunk 1"; a name naming none, whole. */
export function withoutWeek(title, options) {
  const found = weekMatch(title, options);
  if (!found) {
    return tidy(title);
  }
  let text = tidy(title);
  for (const part of found.parts) {
    text = text.replace(part, " ");
  }
  return tidy(
    text.replace(WEEK_OF, " ").replace(/^[\s\-–—_:,]+|[\s\-–—_:,]+$/g, "")
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
 * "Session"), "Wk 2", "W2", a date ("7/6", "July 6"). null if it is none of these.
 */
export function weekValue(text, heading) {
  const value = tidy(text);
  if (/^\d{1,2}$/.test(value)) {
    return /^session/i.test(tidy(heading))
      ? `Session ${Number(value)}`
      : `Week ${Number(value)}`;
  }
  return weekInTitle(value, { column: true });
}
