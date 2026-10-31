/*
 * What each name in the files is, in Greg's order (2026-10-16): fixed activities first, then
 * recurring activities, then what is left is activities (Greg, 2026-10-27: getting this wrong
 * on an ordinary camp is a bug, not a question).
 *
 * The rules, each with its clue, example and test, are docs/import/classification.md (Greg's
 * definitions, wiki decision 0004): fixed is every group, the same block, every day; recurring is
 * a set time that leaves the block free on other days or for other groups; an activity is
 * everything else. Asked only where the grid supports both readings (asks A, B and C there).
 *
 * Special days, special events, and trips are noted, not set up (Greg, 2026-10-16); electives are
 * set up from their words since electives slice E9 (electives.js). Electives and trips by their words (the desktop's elective words, src/ingest/extractEntities.js
 * ELECTIVE_HEADER_TERMS, Apache-2.0; and the camp's own words), special days when one name fills
 * a whole day for most groups.
 */
import { looseKey } from "./engine.shoreshImportEngine.text.mjs";

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
    // INGEST-4.13: a day ending early is the name at its usual slot, started earlier that day.
    const early = c.early || 0;
    const slot = `${c.blockIndex + early}:${c.span - early}`;
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

// The rules below are numbered as in docs/import/classification.md.

function dayCount(facts, week) {
  return (facts.daysByWeek.get(week) || []).length;
}

/** The groups that have anything in the timetable that week (a session may change them). */
function groupsIn(facts, week) {
  return (facts.groupsByWeek && facts.groupsByWeek.get(week)) || facts.groups;
}

/** Whether one pattern is every group of the week on every day it runs (a fixed shape). */
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
 * Most of the timetable's groups at once (two thirds), and at least three groups: with three
 * groups, two of them together once is not "most of camp" (rule 4).
 */
function mostGroups(count, total) {
  return count >= 3 && count * 3 >= total * 2;
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

/** Names still asked as similar to this one ("lunch" for "Lunch"): a Set, maybe empty. */
function spellings(facts) {
  return (facts.similar && facts.similar.get(facts.name)) || new Set();
}

/**
 * The other groups of the week whose cell there says this name, or a name still asked as similar
 * to it ("Swim Returning" for "Swim Return"), on every day of the pattern.
 */
function spelledOtherwise(pattern, facts, week) {
  const names = new Set([facts.name, ...spellings(facts)]);
  if (names.size === 1) {
    return [];
  }
  return groupsIn(facts, week).filter(
    (g) =>
      !pattern.groups.includes(g) &&
      pattern.days.every((d) =>
        names.has(facts.busy.get(`${week}|${g}|${d}|${pattern.block}`))
      )
  );
}

/**
 * Rule 6: two or more groups at once that are whole divisions of the program (every group of
 * those divisions that week, not only the groups that have the name; a group whose cell is
 * spelled otherwise, still asked, counts), or most of its groups.
 */
function divisionShaped(pattern, facts, week) {
  const groups = [...pattern.groups, ...spelledOtherwise(pattern, facts, week)];
  return (
    groups.length >= 2 &&
    (wholeDivisions(groups, facts, groupsIn(facts, week)) ||
      mostGroups(pattern.groups.length, facts.groups.length))
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
 * Held at a set time: whole divisions of the program or most of the groups share it at once; or
 * it repeats for groups that have it in that one slot only.
 */
function isHeld(pattern, facts, week, who) {
  return (
    divisionShaped(pattern, facts, week) ||
    (repeats(pattern, facts, week) &&
      pattern.groups.every((g) => who.slots.get(g).size === 1))
  );
}

/** An all-camp moment: every group of the week together, or most of them. */
function allCamp(pattern, facts, week) {
  const total = groupsIn(facts, week).length;
  return (
    pattern.groups.length === total || mostGroups(pattern.groups.length, total)
  );
}

/**
 * Rule 3: repetition the grid shows: the same groups in the same slot on two days or more, or an
 * all-camp moment (even once). Several divisions together once is not repetition.
 */
function isSetShaped(pattern, facts, week) {
  return pattern.days.length >= 2 || allCamp(pattern, facts, week);
}

function cellCount(patterns) {
  return patterns.reduce((n, p) => n + p.groups.length * p.days.length, 0);
}

/** Each week's patterns sorted into held and stray. */
function sortWeeks(byWeek, weeks, facts) {
  return weeks.map((week) => {
    const all = byWeek.get(week);
    const slots = slotsByGroup(all);
    const who = { slots };
    return {
      week,
      all,
      held: all.filter((p) => isHeld(p, facts, week, who)),
      strays: all.filter((p) => !isHeld(p, facts, week, who))
    };
  });
}

/** Whether a group is there on a day: it has something scheduled (not a trip, not off). */
function present(facts, week, group, day) {
  return (
    (facts.daysByWeek.get(week) || []).includes(day) &&
    facts.present.has(`${week}|${group}|${day}`)
  );
}

/** One week's placements as "group|day|slot". */
function placementsOf(w) {
  return w.all.flatMap((p) =>
    p.groups.flatMap((g) => p.days.map((d) => `${g}|${d}|${p.slot}`))
  );
}

/** Whether every placement of week a is in week b, or b's group is away that day. */
function coveredBy(a, b, facts) {
  const theirs = new Set(placementsOf(b));
  return placementsOf(a).every((key) => {
    const [group, day] = key.split("|");
    return theirs.has(key) || !present(facts, b.week, group, day);
  });
}

/**
 * Rule 5: the same placements in every week that has the name (a week without it is fine). A
 * group away on a day (a trip, off, no cells) is not a change, as for fixed (rule 1).
 */
function sameEveryWeek(sorted, facts) {
  return sorted.every(
    (w) => coveredBy(sorted[0], w, facts) && coveredBy(w, sorted[0], facts)
  );
}

// ---------- rule 1: fixed ----------

/**
 * Whether a group has nothing else scheduled in a slot on a day: no cell there, only a noted one
 * (a trip, a special event) or an "off"/"away" cell, or the name spelled otherwise (still asked).
 * Such a group-day does not break fixed.
 */
function freeAt(facts, at, slot) {
  const busy = facts.busy;
  const other = spellings(facts);
  for (let b = slot.block; b < slot.block + slot.length; b++) {
    const text = busy && busy.get(`${at.week}|${at.group}|${at.day}|${b}`);
    if (text && text !== facts.name && !other.has(text)) {
      return false;
    }
  }
  return true;
}

/** One slot over one week: Map(group -> Set(days)) that have the name exactly there. */
function holdersAt(patterns, slot) {
  const has = new Map();
  for (const p of patterns.filter((x) => x.slot === slot.slot)) {
    p.groups.forEach((g) =>
      has.set(g, new Set([...(has.get(g) || []), ...p.days]))
    );
  }
  return has;
}

/**
 * Counts one slot over one week for rule 1, group by group (into `byGroup`): the days it has the
 * name there, and the days it is there without the name in the slot (empty, or another activity:
 * a gap). A day the group is away (a trip, off, no cells) counts for neither. Returns whether
 * another activity is ever in the slot.
 */
function tallySlot(facts, week, patterns, slot, byGroup) {
  const has = holdersAt(patterns, slot);
  let broken = false;
  for (const group of groupsIn(facts, week)) {
    // INGEST-2.9: a group here only for the other part of the day is away in this slot.
    if (facts.atCamp && !facts.atCamp(group, slot.block)) {
      continue;
    }
    const t = byGroup.get(group) || { held: 0, gaps: 0 };
    byGroup.set(group, t);
    for (const day of facts.daysByWeek.get(week) || []) {
      if (has.has(group) && has.get(group).has(day)) {
        t.held++;
      } else if (!freeAt(facts, { week, group, day }, slot)) {
        broken = true;
        t.gaps++;
      } else if (present(facts, week, group, day)) {
        t.gaps++;
      }
    }
  }
  return broken;
}

/** The distinct slots of the name over the weeks: [{ slot, block, length }]. */
function slotsOf(sorted) {
  const slots = new Map();
  sorted.forEach((w) => w.all.forEach((p) => slots.set(p.slot, p)));
  return [...slots.values()].map(({ slot, block, length }) => ({
    slot,
    block,
    length
  }));
}

function evidenceDays(sorted) {
  const days = new Set();
  sorted.forEach((w) =>
    w.all.forEach((p) => p.days.forEach((d) => days.add(`${w.week}|${d}`)))
  );
  return days.size;
}

/**
 * Rule 1 over the weeks: "fixed", "near" or null. Fixed: in each of its slots every group has the
 * name on every day it is there, and nothing else is ever there. Near (INGEST-3.9, Greg
 * 2026-10-28): it looks like it is for everyone, but not quite: in each slot every group has it
 * on most of its own days there (more days with it than without), and on some day a group's cell
 * there is empty or another activity. Then the director is asked. A day a group is away (no
 * cells, a trip, off) does not count; a group that never has it there is not "every group"; a
 * week without the name (a travel week) must leave the slot free. Two days of evidence (rule 4).
 */
function fixedness(sorted, facts) {
  if (evidenceDays(sorted) < 2) {
    return null;
  }
  const byWeek = new Map(sorted.map((w) => [w.week, w.all]));
  let gaps = 0;
  for (const slot of slotsOf(sorted)) {
    const byGroup = new Map();
    for (const week of facts.weeks) {
      if (!byWeek.has(week)) {
        // A week without the name at all (a travel week) only has to leave the slot free.
        if (tallySlot(facts, week, [], slot, new Map())) {
          return null;
        }
        continue;
      }
      tallySlot(facts, week, byWeek.get(week), slot, byGroup);
    }
    for (const t of byGroup.values()) {
      if (t.held === 0 || t.held <= t.gaps) {
        return null;
      }
      gaps += t.gaps;
    }
  }
  return gaps === 0 ? "fixed" : "near";
}

/** A fixed name's records: one per slot, every group, from the first week. */
function fixedPatterns(sorted) {
  return slotsOf(sorted).map((s) => {
    const here = sorted[0].all.filter((p) => p.slot === s.slot);
    return {
      ...s,
      days: [...new Set(here.flatMap((p) => p.days))],
      groups: [...new Set(here.flatMap((p) => p.groups))].sort()
    };
  });
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
        mostGroups(p.groups.length, facts.groups.length)
    )
  );
  return strong && held >= strays * 3;
}

/**
 * Rule 2: a group has it in three or more different slots in one week: placed at varying times,
 * as a rotation is. Then the name is an activity everywhere in the program, even where a group or
 * division happened to have it in a steady slot.
 */
function movesAround(sorted) {
  return sorted.some((w) =>
    [...slotsByGroup(w.all).values()].some((slots) => slots.size >= 3)
  );
}

/**
 * Rule 3: some placement shows repetition, or the weeks repeat it. A stagger across the camp
 * (Swim for one division in Period 2 and the next in Period 3) counts only when it repeats: then
 * each division has its slot on two days or more. Once is divisions taking turns at an activity.
 */
function showsRepetition(sorted, facts) {
  const w = sorted[0];
  return (
    sorted.length >= 2 || w.held.some((p) => isSetShaped(p, facts, w.week))
  );
}

function verdictOf(sorted, facts) {
  const shape = fixedness(sorted, facts);
  if (shape === "fixed") {
    return { verdict: "fixed" };
  }
  if (movesAround(sorted)) {
    return { verdict: "activity", reason: "moves" };
  }
  // Ask C (rule 9, INGEST-3.9): everyone, same slot, nearly every day: what is it?
  if (shape === "near") {
    return { verdict: "ask", reason: "nearFixed" };
  }
  // Some placements are at no set time: an activity, unless ask A.
  if (sorted.some((w) => w.strays.length > 0)) {
    return mostlyHeld(sorted, facts)
      ? { verdict: "ask", reason: "scattered" }
      : { verdict: "activity" };
  }
  // Ask B: held each week, but at different times from week to week.
  if (!sameEveryWeek(sorted, facts)) {
    return { verdict: "ask", reason: "weeks" };
  }
  if (showsRepetition(sorted, facts)) {
    return { verdict: "recurring" };
  }
  // Rule 7 (Greg 2026-10-27): one or more whole divisions together at once is a set time,
  // even once in a one-week file.
  return sorted[0].held.some(
    (p) =>
      p.groups.length >= 2 &&
      wholeDivisions(p.groups, facts, groupsIn(facts, sorted[0].week))
  )
    ? { verdict: "recurring" }
    : { verdict: "activity" };
}

/**
 * What one name is in one timetable, by the rules in docs/import/classification.md. timetable:
 * { groups: [names], groupsByWeek: Map(week -> groups), divisionOf: Map(group -> division),
 * daysByWeek: Map(week -> days it runs, special days left out), weeks: [..], busy:
 * Map("week|group|day|block" -> name) of what is scheduled there, noted and off cells left out,
 * present: Set("week|group|day") of the days each group has anything in busy, atCamp: (group,
 * block) -> whether the group is here then, by its part of the day (INGEST-2.9) }.
 * Returns { verdict: "fixed" | "recurring" | "activity" | "ask", patterns (the set-time ones,
 * from the first week: one per fixed slot, or the recurring patterns), strays (placements outside
 * them), fixedShaped, reason }.
 */
export function classifyName(cells, timetable) {
  const byWeek = patternsOf(cells);
  const weeks = timetable.weeks.filter((w) => byWeek.has(w));
  const facts = { ...timetable, name: cells[0].text };
  const sorted = sortWeeks(byWeek, weeks, facts);
  const first = sorted[0];
  const decided = verdictOf(sorted, facts);
  const fixed = decided.verdict === "fixed" || decided.reason === "nearFixed";
  return {
    ...decided,
    patterns: fixed ? fixedPatterns(sorted) : first.held,
    strays: fixed ? [] : first.strays,
    fixedShaped:
      fixed || first.held.some((p) => isEveryone(p, facts, first.week)),
    week: first.week
  };
}
