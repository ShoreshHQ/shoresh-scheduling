/*
 * The weeks a list's item is on (INGEST-1.8): one column, in the words its screen's Weeks column
 * shows ("Every week", "Off Week 3", "Off Weeks 1, 6–7", "No weeks"; a location is "Closed"),
 * each week by its place in the season, as the screen numbers them (c/shoreshEditableTable
 * weeksInWords). A cell's value is { off: [places, from 1], of: how many weeks }: read here, its
 * places checked against the season's weeks in the proposal (checkWeeks), and saved as the weeks
 * off a camp workbook's "Which weeks" sheet saves (WeekException records, plan.js weekRecords).
 */
import { FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";
import { tidy } from "./engine.shoreshImportEngine.shoreshImportEngine.mjs";

const OFF = FIELD.WeekException;

/** The screen's words for the weeks, in the camp's word for a week (shoreshCampSetup weekWords). */
function weekWords(t, off) {
  return {
    every: `Every ${t.sIn("Week")}`,
    none: `No ${t.pIn("Week")}`,
    off,
    one: t.s("Week"),
    many: t.p("Week")
  };
}

/** The Weeks column of a list whose item kind ("Group", "Location", ...) has weeks off. */
export function weeksColumn(t, kind) {
  return {
    key: "weeks",
    heading: t.p("Week"),
    words: ["weeks", "which weeks", "runs in", "open in", "weeks off"],
    type: "weeks",
    kind,
    // A place is closed, not off (docs/design/setup/locations.html).
    weekWords: weekWords(t, kind === "Location" ? "Closed" : "Off"),
    fromRecord: (r, setup) => offWeeks(setup, r.Id)
  };
}

/** The places in the season (from 1) of the weeks an item is off, and how many weeks there are. */
export function offWeeks(setup, itemId) {
  const weeks = (setup && setup.weeks) || [];
  const off = new Set(
    ((setup && setup.weekExceptions) || [])
      .filter((x) => targetOf(x) === itemId)
      .map((x) => x[OFF.Week])
  );
  return {
    off: weeks.map((w, i) => (off.has(w.Id) ? i + 1 : 0)).filter((n) => n),
    of: weeks.length
  };
}

function targetOf(exception) {
  return (
    exception[OFF.Group] ||
    exception[OFF.Location] ||
    exception[OFF.Activity] ||
    exception[OFF.FixedActivity] ||
    exception[OFF.RecurringActivity]
  );
}

/** "1, 3–4": places, runs of them joined, as the screen writes them. */
function ranges(numbers) {
  const out = [];
  numbers.forEach((n, i) => {
    if (i && n === numbers[i - 1] + 1) {
      out[out.length - 1].last = n;
    } else {
      out.push({ first: n, last: n });
    }
  });
  return out
    .map((r) => (r.first === r.last ? `${r.first}` : `${r.first}–${r.last}`))
    .join(", ");
}

/** The weeks in the screen's words. */
export function weeksText(column, value) {
  const words = column.weekWords;
  const off = [...((value && value.off) || [])].sort((a, b) => a - b);
  if (!off.length) {
    return words.every;
  }
  if (value.of && off.length >= value.of) {
    return words.none;
  }
  return `${words.off} ${off.length > 1 ? words.many : words.one} ${ranges(off)}`;
}

function escaped(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A Weeks cell: { value: { off, of } } ("all" in off for no weeks, set from the season by
 * checkWeeks) or { problem }. Reads the screen's words, "Off", "Closed", "Not in" or "Except"
 * before the weeks, and the week word or none before each number ("Off Week 1, Week 3").
 */
export function readWeeks(column, text) {
  const words = column.weekWords;
  const said = tidy(text).toLowerCase();
  const plain = (w) => w.toLowerCase();
  if (
    [plain(words.every), "every week", "all weeks", "all", "every"].includes(
      said
    )
  ) {
    return { value: { off: [], of: 0 } };
  }
  if ([plain(words.none), "no weeks", "none", "never"].includes(said)) {
    return { value: { off: "all", of: 0 } };
  }
  const weekWord = [words.one, words.many, "weeks", "week", "wks", "wk"]
    .map((w) => escaped(plain(w)))
    .join("|");
  const lead = /^(?:off|closed|not in|except)\s+/;
  if (!lead.test(said)) {
    return {
      problem: `"${tidy(text)}" isn't like "${words.every}" or "${words.off} ${words.one} 2"`
    };
  }
  const list = said
    .replace(lead, "")
    // Every dash-like character as "-" (cells.js plainDashes; not imported, cells.js reads this).
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(new RegExp(`(^|[\\s,;&-])(?:${weekWord})(?=\\s*\\d)`, "g"), "$1")
    .replace(/\s+(?:to|through|thru)\s+/g, "-")
    .replace(/\s+and\s+|&/g, ",");
  const off = new Set();
  for (const part of list.split(/[,;]/).map((p) => p.trim())) {
    const m = /^(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/.exec(part);
    if (!m || (m[2] && Number(m[2]) < Number(m[1]))) {
      return {
        problem: `"${tidy(text)}": "${part}" isn't ${words.one} 2 or ${words.one}s 2–3`
      };
    }
    for (let n = Number(m[1]); n <= Number(m[2] || m[1]); n++) {
      off.add(n);
    }
  }
  return { value: { off: [...off].sort((a, b) => a - b), of: 0 } };
}

/**
 * Each row's weeks set against the season's: "No weeks" is every week, and a place past the
 * season's last week can't be read ("Weeks: there's no Week 5").
 */
export function checkWeeks(rows, column, setup) {
  const count = ((setup && setup.weeks) || []).length;
  rows.forEach((r) => {
    const value = r.values[column.key];
    if (!value) {
      return;
    }
    const off =
      value.off === "all"
        ? Array.from({ length: count }, (_, i) => i + 1)
        : value.off;
    const past = off.filter((n) => n < 1 || n > count);
    if (past.length) {
      r.problems.push(
        `${column.heading}: there's no ${column.weekWords.one} ${past[0]}`
      );
      return;
    }
    r.values[column.key] = { off, of: count };
  });
}

/**
 * The save's weeks off for one item (WeekException records, as the camp workbook's Which weeks
 * sends them): one added for each week newly off, one removed for each week back on. item: the
 * record's Id, or its key when the same save adds it.
 */
export function weekRecords(setup, kind, item, off) {
  const weeks = (setup && setup.weeks) || [];
  const now = new Map(
    ((setup && setup.weekExceptions) || [])
      .filter((x) => targetOf(x) === item)
      .map((x) => [x[OFF.Week], x])
  );
  const wanted = new Set(
    ((off && off.off) || []).map((n) => weeks[n - 1] && weeks[n - 1].Id)
  );
  const records = [];
  weeks.forEach((w) => {
    if (wanted.has(w.Id) && !now.has(w.Id)) {
      records.push({
        kind: "WeekException",
        key: `WeekException:${item}:${w.Id}`,
        fields: {},
        refs: { [OFF.Week]: w.Id, [OFF[kind]]: item }
      });
    } else if (!wanted.has(w.Id) && now.has(w.Id)) {
      records.push({
        kind: "WeekException",
        id: now.get(w.Id).Id,
        remove: true,
        fields: {}
      });
    }
  });
  return records;
}
