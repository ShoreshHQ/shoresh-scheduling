/*
 * What each name in the files is, in Greg's order (2026-10-16): fixed activities first, then
 * recurring activities, then what is left is activities. Suggested on its own only when sure;
 * anything less certain becomes a question; a name both at set times and scattered elsewhere is
 * never decided silently.
 *
 * Sure, for a name in one program:
 * - fixed: every group, the same time block (and length), every day the program runs that week,
 *   in every week the files cover, and nowhere else;
 * - recurring: every placement sits in set-time patterns (the same groups, same time block, same
 *   days), each pattern covering whole divisions (or everyone), the same in every week, and
 *   nowhere else.
 * A pattern looks set-time when it holds on two or more days, or for most of the groups at once
 * (two thirds, as the desktop's weekly rule). A name with no such pattern is an activity, which
 * is what every rotation looks like. Everything in between is asked.
 *
 * Electives, special days, special events, and trips are noted, not set up (Greg, 2026-10-16):
 * electives and trips by their words (the desktop's elective words, src/ingest/extractEntities.js
 * ELECTIVE_HEADER_TERMS, Apache-2.0; and the camp's own words), special days when one name fills
 * a whole day for most groups.
 */
import { looseKey } from "./text";

const ELECTIVE_WORDS = [
  "chugim",
  "bechirot",
  "electives",
  "elective",
  "indoor elective",
  "outdoor elective"
];
const TRIP = /\b(field\s+)?(trip|trips|outing|outings|excursion|excursions)\b/i;
const SPECIAL_EVENT = /\bspecial\s+events?\b/i;

function wordsOf(terms, term) {
  return [terms.s(term), terms.p(term)].map(looseKey);
}

function containsWord(name, words) {
  const key = looseKey(name);
  return words.some(
    (w) =>
      w &&
      new RegExp(
        `(^|\\W)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\W)`
      ).test(key)
  );
}

/** Whether a name is something noted but not set up: "E" elective, "T" trip, "S" event, or null. */
export function notedKindByWords(name, terms) {
  const key = looseKey(name);
  if (
    ELECTIVE_WORDS.includes(key) ||
    wordsOf(terms, "Elective").includes(key)
  ) {
    return "E";
  }
  if (TRIP.test(name) || containsWord(name, wordsOf(terms, "Trip"))) {
    return "T";
  }
  if (
    SPECIAL_EVENT.test(name) ||
    containsWord(name, wordsOf(terms, "SpecialEvent"))
  ) {
    return "S";
  }
  if (containsWord(name, wordsOf(terms, "SpecialDay"))) {
    return "D";
  }
  return null;
}

/**
 * Names that fill a whole day: on one day only, for at least two thirds of the timetable's
 * groups, covering at least three quarters of that day's time blocks for each of them.
 */
export function specialDayNames(cells, groupCount, blockCount) {
  const byName = new Map();
  for (const c of cells) {
    if (!byName.has(c.text)) {
      byName.set(c.text, new Map());
    }
    const key = `${c.week}|${c.day}|${c.group}`;
    const covered = byName.get(c.text);
    covered.set(key, (covered.get(key) || 0) + c.span);
  }
  const result = new Set();
  for (const [name, covered] of byName) {
    const days = new Set(
      [...covered.keys()].map((k) => k.split("|").slice(0, 2).join("|"))
    );
    const full = [...covered.values()].filter(
      (n) => n * 4 >= blockCount * 3
    ).length;
    if (
      days.size === 1 &&
      full * 3 >= groupCount * 2 &&
      full === covered.size
    ) {
      result.add(name);
    }
  }
  return result;
}

// ---------- patterns ----------

function setKey(values) {
  return [...values].sort().join(",");
}

/**
 * The patterns of one name in one timetable: for each week, its placements grouped by slot
 * (start block and length) and then by the exact days each group has it there.
 * Returns Map(week -> [{ slot, block, length, days: [..], groups: [..] }]).
 */
export function patternsOf(cells) {
  const byWeek = new Map();
  for (const c of cells) {
    if (!byWeek.has(c.week)) {
      byWeek.set(c.week, new Map());
    }
    const slots = byWeek.get(c.week);
    const slot = `${c.blockIndex}:${c.span}`;
    if (!slots.has(slot)) {
      slots.set(slot, new Map());
    }
    const groups = slots.get(slot);
    if (!groups.has(c.group)) {
      groups.set(c.group, new Set());
    }
    groups.get(c.group).add(c.day);
  }
  const result = new Map();
  for (const [week, slots] of byWeek) {
    const patterns = [];
    for (const [slot, groups] of slots) {
      const byDays = new Map();
      for (const [group, days] of groups) {
        const key = setKey(days);
        if (!byDays.has(key)) {
          byDays.set(key, { days: [...days], groups: [] });
        }
        byDays.get(key).groups.push(group);
      }
      const [block, length] = slot.split(":").map(Number);
      for (const entry of byDays.values()) {
        patterns.push({
          slot,
          block,
          length,
          days: entry.days,
          groups: entry.groups.sort()
        });
      }
    }
    result.set(week, patterns);
  }
  return result;
}

function signature(pattern) {
  return `${pattern.slot}|${setKey(pattern.days)}|${pattern.groups.join(",")}`;
}

/**
 * A pattern looks set-time when the same groups have it in the same slot on most days of the
 * week (more than half, as the desktop's daily rule), or most of the groups have it at once
 * (two thirds, as its weekly rule), or a whole division of two or more groups has it at once.
 */
function looksSetTime(pattern, timetable, week) {
  const dayCount = (timetable.daysByWeek.get(week) || []).length;
  const groupCount = timetable.groups.length;
  return (
    pattern.days.length * 2 > dayCount ||
    pattern.groups.length >= Math.max(2, Math.ceil((groupCount * 2) / 3)) ||
    (pattern.groups.length >= 2 && wholeDivisions(pattern.groups, timetable))
  );
}

/** Strong on its own: most days, or most groups. A division on one day needs a second week. */
function strongPattern(pattern, timetable, week) {
  const dayCount = (timetable.daysByWeek.get(week) || []).length;
  return (
    pattern.days.length * 2 > dayCount ||
    pattern.groups.length >= Math.ceil((timetable.groups.length * 2) / 3)
  );
}

/** Whether a set of groups is whole divisions (or everyone). */
function wholeDivisions(groups, timetable) {
  const set = new Set(groups);
  if (set.size === timetable.groups.length) {
    return true;
  }
  const touched = new Set(groups.map((g) => timetable.divisionOf.get(g)));
  if (touched.has(null) || touched.has(undefined)) {
    return false;
  }
  const covered = timetable.groups.filter((g) =>
    touched.has(timetable.divisionOf.get(g))
  );
  return covered.length === set.size;
}

function isEveryone(pattern, timetable, week) {
  // Every day the program runs that week, special days aside (a fixed activity may still show
  // on a special day, or not).
  const days = timetable.daysByWeek.get(week) || [];
  return (
    pattern.groups.length === timetable.groups.length &&
    days.length > 0 &&
    days.every((d) => pattern.days.includes(d))
  );
}

/**
 * What one name is in one timetable. timetable: { groups: [names], divisionOf: Map(group ->
 * division), daysByWeek: Map(week -> days it runs, special days left out), weeks: [..] }.
 * Returns { verdict: "fixed" | "recurring" | "activity" | "ask", patterns (the set-time ones,
 * from the first week), strays (placements outside them), fixedShaped, reason }.
 */
export function classifyName(cells, timetable) {
  const byWeek = patternsOf(cells);
  const weeks = timetable.weeks.filter((w) => byWeek.has(w));
  const firstWeek = weeks[0];
  const first = byWeek.get(firstWeek) || [];
  const setTime = first.filter((p) => looksSetTime(p, timetable, firstWeek));
  const strays = first.filter((p) => !looksSetTime(p, timetable, firstWeek));
  const result = {
    patterns: setTime,
    strays,
    fixedShaped: false,
    week: firstWeek
  };
  if (setTime.length === 0) {
    return { ...result, verdict: "activity" };
  }
  const sameEveryWeek =
    weeks.length === timetable.weeks.length &&
    weeks.every(
      (w) =>
        setKey(byWeek.get(w).map(signature)) === setKey(first.map(signature))
    );
  result.fixedShaped = setTime.some((p) => isEveryone(p, timetable, firstWeek));
  if (!sameEveryWeek) {
    return { ...result, verdict: "ask", reason: "weeks" };
  }
  if (strays.length > 0) {
    return { ...result, verdict: "ask", reason: "scattered" };
  }
  if (result.fixedShaped) {
    return {
      ...result,
      verdict: setTime.length === 1 ? "fixed" : "ask",
      reason: "partial"
    };
  }
  const provenByWeeks = timetable.weeks.length >= 2;
  const sure = setTime.every(
    (p) =>
      wholeDivisions(p.groups, timetable) &&
      (provenByWeeks || strongPattern(p, timetable, firstWeek))
  );
  return sure
    ? { ...result, verdict: "recurring" }
    : { ...result, verdict: "ask", reason: "partial" };
}
