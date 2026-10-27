/*
 * What each name in the files is, in Greg's order (2026-10-16): fixed activities first, then
 * recurring activities, then what is left is activities (Greg, 2026-10-27: getting this wrong
 * on an ordinary camp is a bug, not a question).
 *
 * The rules, each with its clue, example and test, are docs/import/classification.md (Greg's
 * definitions, wiki decision 0004): fixed is every group, the same block, every day; recurring is
 * a set time that leaves the block free on other days or for other groups; an activity is
 * everything else. Asked only where the grid supports both readings (asks A and B there).
 *
 * Special days, special events, and trips are noted, not set up (Greg, 2026-10-16); electives are
 * set up from their words since electives slice E9 (electives.js). Electives and trips by their words (the desktop's elective words, src/ingest/extractEntities.js
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
  // The camp's own word: for an elective set (Camp words), or as the screens call electives.
  if (
    ELECTIVE_WORDS.includes(key) ||
    wordsOf(terms, "Elective").includes(key) ||
    wordsOf(terms, "ElectiveSet").includes(key)
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

// The rules below are numbered as in docs/import/classification.md.

function dayCount(facts, week) {
  return (facts.daysByWeek.get(week) || []).length;
}

/** The groups that have anything in the timetable that week (a session may change them). */
function groupsIn(facts, week) {
  return (facts.groupsByWeek && facts.groupsByWeek.get(week)) || facts.groups;
}

/** Rule 1: every group of the week, the same slot, every day the program runs that week. */
function isEveryone(pattern, facts, week) {
  const days = facts.daysByWeek.get(week) || [];
  return (
    pattern.groups.length === groupsIn(facts, week).length &&
    days.length > 0 &&
    days.every((d) => pattern.days.includes(d))
  );
}

/**
 * Rule 3: the same groups have it in the same slot on most days of the week, and on two days at
 * least (one day shows no repeat).
 */
function repeats(pattern, facts, week) {
  return (
    pattern.days.length >= 2 && pattern.days.length * 2 > dayCount(facts, week)
  );
}

/**
 * Whether a set of groups is whole divisions (or everyone), among `among` (by default every
 * group of the timetable).
 */
function wholeDivisions(groups, facts, among = facts.groups) {
  const set = new Set(groups);
  if (set.size === among.length) {
    return true;
  }
  const touched = new Set(groups.map((g) => facts.divisionOf.get(g)));
  if (touched.has(null) || touched.has(undefined) || touched.has("")) {
    return false;
  }
  const covered = among.filter((g) => touched.has(facts.divisionOf.get(g)));
  return covered.length === set.size;
}

/**
 * Rule 2: two or more groups at once that are whole divisions of the groups that have the name
 * (`holders`), or most of the timetable's groups (two thirds).
 */
function divisionShaped(pattern, facts, holders) {
  return (
    pattern.groups.length >= 2 &&
    (wholeDivisions(pattern.groups, facts, holders) ||
      pattern.groups.length * 3 >= facts.groups.length * 2)
  );
}

/** Each group's slots for the name in one week: Map(group -> Set(slot)). */
function slotsByGroup(patterns) {
  const slots = new Map();
  for (const p of patterns) {
    for (const g of p.groups) {
      slots.set(g, (slots.get(g) || new Set()).add(p.slot));
    }
  }
  return slots;
}

/**
 * Rules 2 and 3: held at a set time: whole divisions (of the groups that have it at all) or most
 * of the groups share it at once; or it repeats for groups that have it in that one slot only.
 */
function isHeld(pattern, facts, week, who) {
  return (
    divisionShaped(pattern, facts, who.holders) ||
    (repeats(pattern, facts, week) &&
      pattern.groups.every((g) => who.slots.get(g).size === 1))
  );
}

/** Rule 4: a set time on its own: it repeats, or it is whole divisions of the timetable. */
function isSetShaped(pattern, facts, week) {
  return repeats(pattern, facts, week) || divisionShaped(pattern, facts);
}

function cellCount(patterns) {
  return patterns.reduce((n, p) => n + p.groups.length * p.days.length, 0);
}

/** Each week's patterns sorted into held and stray. */
function sortWeeks(byWeek, weeks, facts) {
  return weeks.map((week) => {
    const all = byWeek.get(week);
    const slots = slotsByGroup(all);
    const who = { holders: [...slots.keys()], slots };
    return {
      week,
      all,
      held: all.filter((p) => isHeld(p, facts, week, who)),
      strays: all.filter((p) => !isHeld(p, facts, week, who))
    };
  });
}

function sameEveryWeek(sorted, facts) {
  const first = setKey(sorted[0].all.map(signature));
  return (
    sorted.length === facts.weeks.length &&
    sorted.every((w) => setKey(w.all.map(signature)) === first)
  );
}

/** Rule 1 over the weeks: every placement is in an everyone slot, the same slots each week. */
function isFixed(sorted, facts) {
  const slots = (w) => setKey(w.all.map((p) => p.slot));
  return (
    sorted.length === facts.weeks.length &&
    sorted.every(
      (w) =>
        w.all.every((p) => isEveryone(p, facts, w.week)) &&
        slots(w) === slots(sorted[0])
    )
  );
}

/**
 * Ask A: mostly at a set time with a few placements elsewhere: a strong set time (most days or
 * most groups) holds at least three quarters of its placements.
 */
function mostlyHeld(sorted, facts) {
  const held = sorted.reduce((n, w) => n + cellCount(w.held), 0);
  const strays = sorted.reduce((n, w) => n + cellCount(w.strays), 0);
  const strong = sorted.some((w) =>
    w.held.some(
      (p) =>
        repeats(p, facts, w.week) ||
        p.groups.length * 3 >= facts.groups.length * 2
    )
  );
  return strong && held >= strays * 3;
}

function verdictOf(sorted, facts) {
  if (isFixed(sorted, facts)) {
    return { verdict: "fixed" };
  }
  // Rule 6 (some placements are at no set time), unless ask A.
  if (sorted.some((w) => w.strays.length > 0)) {
    return mostlyHeld(sorted, facts)
      ? { verdict: "ask", reason: "scattered" }
      : { verdict: "activity" };
  }
  if (movesAround(sorted)) {
    return { verdict: "activity" };
  }
  // Ask B: held each week, but at different times from week to week.
  if (!sameEveryWeek(sorted, facts)) {
    return { verdict: "ask", reason: "weeks" };
  }
  const setShaped = sorted[0].held.some((p) =>
    isSetShaped(p, facts, sorted[0].week)
  );
  // Rule 4, else rule 6.
  return setShaped ? { verdict: "recurring" } : { verdict: "activity" };
}

/**
 * Rule 5: a group has it in three or more different slots in one week: placed at varying times,
 * as a rotation is, even when a whole division goes together.
 */
function movesAround(sorted) {
  return sorted.some((w) =>
    [...slotsByGroup(w.all).values()].some((slots) => slots.size >= 3)
  );
}

/**
 * What one name is in one timetable, by the rules in docs/import/classification.md. timetable:
 * { groups: [names], groupsByWeek: Map(week -> groups), divisionOf: Map(group -> division),
 * daysByWeek: Map(week -> days it runs, special days left out), weeks: [..] }.
 * Returns { verdict: "fixed" | "recurring" | "activity" | "ask", patterns (the set-time ones,
 * from the first week: one per fixed slot, or the recurring patterns), strays (placements outside
 * them), fixedShaped, reason }.
 */
export function classifyName(cells, timetable) {
  const byWeek = patternsOf(cells);
  const weeks = timetable.weeks.filter((w) => byWeek.has(w));
  const sorted = sortWeeks(byWeek, weeks, timetable);
  const first = sorted[0];
  const decided = verdictOf(sorted, timetable);
  return {
    ...decided,
    patterns: first.held,
    strays: first.strays,
    fixedShaped: first.held.some((p) => isEveryone(p, timetable, first.week)),
    week: first.week
  };
}
