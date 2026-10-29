/*
 * What each name becomes: a fixed activity, recurring activities, an activity, or something
 * noted but not set up (an elective, special day, special event, or trip). Names the camp
 * already has keep the kind they have (fixed, recurring, and activity are mutually exclusive);
 * where the file disagrees with them, the director is asked whether to change them.
 */
import { classifyName, notedKindByWords, specialDayNames } from "./classify";
import { atCampIn } from "./availability";
import { deletedActivity } from "./deleted";
import { LEAVE_OUT } from "./reading";
import { looseKey, WEEKDAYS } from "./text";

// ---------- usable placements ----------

function blockIndexes(timetables) {
  const result = new Map();
  for (const t of timetables) {
    t.blocks.forEach((b, i) => result.set(`${t.index}|${b.fileKey}`, i));
  }
  return result;
}

/** Placements that can be set up: their timetable, group, and time block are all kept. */
export function usablePlacements(reading, timetables, groups) {
  const keptGroups = new Set(
    groups.filter((g) => !g.leftOut).map((g) => g.name)
  );
  const indexes = blockIndexes(timetables);
  const usable = [];
  const leftOut = [];
  for (const p of reading.placements) {
    const t = timetables[p.timetable];
    const blockIndex = indexes.get(`${p.timetable}|${p.blockKey}`);
    const block = t && blockIndex !== undefined ? t.blocks[blockIndex] : null;
    const ok =
      t &&
      !t.leftOut &&
      keptGroups.has(p.group) &&
      block &&
      !block.leftOut &&
      !block.untimed;
    if (ok && t.days.includes(p.day)) {
      usable.push({ ...p, blockIndex });
    } else {
      leftOut.push(p);
    }
  }
  return { usable, leftOut };
}

// ---------- noted, not set up ----------

/**
 * Names noted but not set up, with their kind, and the special days to leave out of "every day".
 * Electives (electives.js) are "E" here too, so nothing else decides them; an elective word that is
 * not one after all (the camp has it, or "Not electives") goes the usual way.
 */
function notedNames(usable, timetables, terms, electiveTexts) {
  const kinds = new Map();
  const specialDays = new Map();
  for (const p of usable) {
    const word = notedKindByWords(p.text, terms);
    const kind = electiveTexts.has(p.text) ? "E" : word === "E" ? null : word;
    if (kind) {
      kinds.set(p.text, kind);
    }
  }
  for (const t of timetables) {
    const cells = usable.filter(
      (p) => p.timetable === t.index && !kinds.has(p.text)
    );
    for (const name of specialDayNames(
      cells,
      t.groups.length,
      t.blocks.length
    )) {
      kinds.set(name, "D");
      cells
        .filter((p) => p.text === name)
        .forEach((p) => specialDays.set(`${t.index}|${p.week}|${p.day}`, true));
    }
  }
  return { kinds, specialDays };
}

/** "Off" and "away" cells: nothing scheduled for that group then. */
const OFF = /^(off|away|day off|absent|no camp|closed)$/;

/**
 * What is scheduled where: Map("week|group|day|block" -> name), leaving out noted names (trips,
 * special events) and off cells, which never break a fixed activity (rule 1).
 */
function busyMap(here, noted) {
  const busy = new Map();
  for (const p of here) {
    if (noted.has(p.text) || OFF.test(looseKey(p.text))) {
      continue;
    }
    for (let b = p.blockIndex; b < p.blockIndex + p.span; b++) {
      busy.set(`${p.week}|${p.group}|${p.day}|${b}`, p.text);
    }
  }
  return busy;
}

function timetableFacts(t, usable, ctx) {
  const { specialDays, divisionOf } = ctx;
  const here = usable.filter((p) => p.timetable === t.index);
  const weeks = [...new Set(here.map((p) => p.week))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const daysByWeek = new Map(
    weeks.map((w) => [
      w,
      t.days.filter(
        (d) =>
          here.some((p) => p.week === w && p.day === d) &&
          !specialDays.has(`${t.index}|${w}|${d}`)
      )
    ])
  );
  const groups = [...new Set(here.map((p) => p.group))];
  const groupsByWeek = new Map(
    weeks.map((w) => [
      w,
      [...new Set(here.filter((p) => p.week === w).map((p) => p.group))]
    ])
  );
  const busy = busyMap(here, ctx.noted);
  const present = new Set(
    [...busy.keys()].map((k) => k.split("|").slice(0, 3).join("|"))
  );
  return {
    groups,
    groupsByWeek,
    divisionOf,
    daysByWeek,
    weeks,
    busy,
    present,
    // INGEST-2.9: a group here for part of the day is away the other part, not a gap.
    atCamp: (group, block) => atCampIn(ctx.availability, t, group, block),
    similar: ctx.similar || new Map()
  };
}

// ---------- what the camp already has ----------

function campItems(existing) {
  const activities = new Map(
    ((existing && existing.activities) || []).map((a) => [a.Name, a])
  );
  const fixed = new Map();
  const recurring = new Map();
  for (const entry of (existing && existing.programs) || []) {
    (entry.fixedActivities || []).forEach((f) =>
      fixed.set(`${entry.program.Id}|${f.Name}`, f)
    );
    (entry.recurringActivities || []).forEach((r) =>
      recurring.set(`${entry.program.Id}|${r.Name}`, r)
    );
  }
  return { activities, fixed, recurring };
}

function existingKind(name, t, camp) {
  if (camp.activities.has(name)) {
    return "activity";
  }
  if (t.program && camp.fixed.has(`${t.program.id}|${name}`)) {
    return "fixed";
  }
  if (t.program && camp.recurring.has(`${t.program.id}|${name}`)) {
    return "recurring";
  }
  return null;
}

// ---------- one name ----------

/**
 * The kinds a name read without asking may be changed to (review.md INGEST-5.1): fixed only
 * when everyone holds it at one time, recurring only when it has a set-time pattern; an
 * activity always.
 */
export function kindsThatFit(decided) {
  const kinds = [];
  if (
    decided.verdict === "fixed" ||
    (decided.fixedShaped && decided.patterns.length)
  ) {
    kinds.push("fixed");
  }
  if (decided.patterns.length) {
    kinds.push("recurring");
  }
  kinds.push("activity");
  return kinds;
}

function verdictFor(name, t, facts, decided, ctx) {
  const known = existingKind(name, t, ctx.camp);
  if (known) {
    return { ...decided, kind: known, existing: true };
  }
  // Deleted on a setup screen before: left out, not asked about, until brought back.
  const gone = deletedActivity(ctx.deletions, t.name, name);
  if (gone) {
    return {
      ...decided,
      kind: decided.verdict === "ask" ? "activity" : decided.verdict,
      leftOut: true,
      deleted: gone
    };
  }
  const several = ctx.timetables.filter((x) => !x.leftOut).length > 1;
  const id = `kind|${name}${several ? `|${t.name}` : ""}`;
  if (decided.verdict !== "ask") {
    // review.md INGEST-5.1: read without asking, and listed under "Read as" with a one-click
    // change; a change that fits the name's pattern is the director's.
    const changed = ctx.answers[id];
    const kind =
      changed && kindsThatFit(decided).includes(changed)
        ? changed
        : decided.verdict;
    return { ...decided, kind, readAs: id, several };
  }
  ctx.asks.push({
    id,
    type: "kind",
    name,
    program: t.name,
    several,
    facts: decided,
    timetable: t,
    timetableFacts: facts
  });
  const answer = ctx.answers[id];
  return {
    ...decided,
    kind: answer || "activity",
    asked: id,
    leftOut: answer === LEAVE_OUT
  };
}

/** The cells of each name in one timetable, names in order: [[name, cells]]. */
function cellsByName(usable, t, noted) {
  const byName = new Map();
  for (const p of usable.filter(
    (x) => x.timetable === t.index && !noted.has(x.text)
  )) {
    if (!byName.has(p.text)) {
      byName.set(p.text, []);
    }
    byName.get(p.text).push(p);
  }
  return [...byName].sort((a, b) => a[0].localeCompare(b[0]));
}

function oneDay(facts) {
  return new Set([...facts.daysByWeek.values()].flat()).size <= 1;
}

function sameSlot(a, b) {
  const at = (r, p) => `${r.timetable.blocks[p.block].start}|${p.length}`;
  const theirs = new Set(b.patterns.map((p) => at(b, p)));
  return a.patterns.every((p) => theirs.has(at(a, p)));
}

/**
 * Rule 4's two days of evidence may come from the same groups' other timetable: everyone at one
 * time on a one-day timetable is fixed when the name is fixed at that time in another timetable
 * that has those groups (a Friday read as a program of its own). baseOf: Map(group -> the group it
 * is in every program).
 */
function withOtherDays(results, baseOf) {
  const base = (g) => (baseOf && baseOf.get(g)) || g;
  return results.map((r) => {
    if (
      r.kind !== "recurring" ||
      r.existing ||
      !r.fixedShaped ||
      !oneDay(r.facts)
    ) {
      return r;
    }
    const fixedElsewhere = results.some(
      (o) =>
        o.timetable !== r.timetable &&
        o.name === r.name &&
        o.kind === "fixed" &&
        r.facts.groups.every((g) =>
          o.facts.groups.map(base).includes(base(g))
        ) &&
        sameSlot(r, o)
    );
    return fixedElsewhere ? { ...r, kind: "fixed", verdict: "fixed" } : r;
  });
}

/** Each name in each timetable: { name, timetable, kind, patterns, strays, existing, leftOut }. */
export function decideKinds(usable, ctx) {
  const results = [];
  for (const t of ctx.timetables.filter((x) => !x.leftOut)) {
    const facts = timetableFacts(t, usable, ctx);
    const named = cellsByName(usable, t, ctx.noted);
    const decided = named.map(([name, cells]) => [
      name,
      classifyName(cells, facts)
    ]);
    decided.forEach(([name, d], i) => {
      results.push({
        name,
        timetable: t,
        facts,
        cells: named[i][1],
        ...verdictFor(name, t, facts, d, ctx)
      });
    });
  }
  return withOtherDays(results, ctx.baseOf);
}

// ---------- records ----------

function mostCommon(values) {
  const counts = new Map();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function onePlace(cells) {
  const places = new Set(cells.map((c) => c.place).filter(Boolean));
  return places.size === 1 ? [...places][0] : null;
}

export function blockRecordKey(t, index) {
  const block = t.blocks[index];
  return block.id || `B|${t.key}|${block.fileKey}`;
}

/** Who a pattern covers: everyone ([]), whole divisions, or the groups by name. */
function whoOf(groups, facts, keyOf, programKey) {
  if (
    groups.length === facts.groups.length &&
    keyOf.coveredBy(programKey, groups)
  ) {
    return { keys: [], names: [] };
  }
  const divisions = [...new Set(groups.map((g) => facts.divisionOf.get(g)))];
  const whole =
    divisions.every(
      (d) =>
        // DIV-1.1: groups in no division are no division together.
        d &&
        facts.groups
          .filter((g) => facts.divisionOf.get(g) === d)
          .every((g) => groups.includes(g))
    ) && groups.every((g) => keyOf.coveredBy(keyOf.divisionOf(g), groups));
  if (whole) {
    return {
      keys: [...new Set(groups.map((g) => keyOf.divisionOf(g)))],
      names: divisions
    };
  }
  return {
    keys: groups.map((g) => keyOf.group(g)),
    names: groups,
    byGroup: true
  };
}

/**
 * A new fixed activity's key: by name, and by its time block when the name is fixed at several
 * (Carpool in the morning and the afternoon).
 */
export function fixedKey(t, name, block) {
  return block === null ? `F|${t.key}|${name}` : `F|${t.key}|${name}|${block}`;
}

export function setTimeRecords(decision, keyOf) {
  const t = decision.timetable;
  const place = onePlace(decision.cells);
  if (decision.kind === "fixed") {
    const several = decision.patterns.length > 1;
    return decision.patterns.map((p) => ({
      kind: "fixed",
      key: fixedKey(t, decision.name, several ? p.block : null),
      name: decision.name,
      timetable: t,
      programKey: t.key,
      block: p.block,
      blockKey: blockRecordKey(t, p.block),
      length: p.length,
      place
    }));
  }
  return decision.patterns.map((p) => ({
    kind: "recurring",
    key: `R|${t.key}|${decision.name}|${p.block}|${p.length}|${p.days.join(",")}`,
    groups: p.groups,
    name: decision.name,
    timetable: t,
    programKey: t.key,
    block: p.block,
    blockKey: blockRecordKey(t, p.block),
    length: p.length,
    days: WEEKDAYS.filter((d) => p.days.includes(d)),
    who: whoOf(p.groups, decision.facts, keyOf, t.key),
    place
  }));
}

/**
 * One activity from every placement of its name: how long it runs (the length it has most
 * often), how many times a week each group had it (fewest and most, counting none for a group
 * that could do it and did not), how many groups at once, who can do it (whole divisions, only
 * when no other group did it), and its place when the file names one place for it.
 */
/**
 * Who can do an activity, written out whenever it is not everyone in the season: whole divisions
 * where the groups cover them, the groups by name otherwise.
 */
function whoOfPool(pool, divisionOf, keyOf) {
  const keys = [];
  const names = [];
  // By division record, not name: two programs may each have a "Juniors".
  for (const key of [...new Set(pool.map((g) => keyOf.divisionOf(g)))]) {
    const here = pool.filter((g) => keyOf.divisionOf(g) === key);
    // DIV-1.1: a group in no division is named itself, never its holding record.
    if (divisionOf.get(here[0]) && keyOf.coveredBy(key, pool)) {
      keys.push(key);
      names.push(divisionOf.get(here[0]));
    } else {
      here.forEach((g) => {
        keys.push(keyOf.group(g));
        names.push(g);
      });
    }
  }
  return { keys, names };
}

export function activityRecord(name, cells, allGroups, divisionOf, keyOf) {
  const doers = [...new Set(cells.map((c) => c.group))];
  // Divisions by record (two programs may each have a "Juniors").
  const divisionKeys = [...new Set(doers.map((g) => keyOf.divisionOf(g)))];
  const divisions = divisionKeys.map((key) =>
    divisionOf.get(doers.find((g) => keyOf.divisionOf(g) === key))
  );
  const inDivisions = allGroups.filter((g) =>
    divisionKeys.includes(keyOf.divisionOf(g))
  );
  // DIV-1.1: a group in no division is no division the activity could be for.
  const whole =
    divisions.every(Boolean) &&
    inDivisions.length === doers.length &&
    inDivisions.length < allGroups.length &&
    doers.every((g) => keyOf.coveredBy(keyOf.divisionOf(g), doers));
  const eligible = whole ? inDivisions : allGroups;
  const weeks = [...new Set(cells.map((c) => c.week))];
  const perGroupWeek = eligible.flatMap((g) =>
    weeks.map((w) => cells.filter((c) => c.group === g && c.week === w).length)
  );
  const atOnce = new Map();
  cells.forEach((c) => {
    const key = `${c.week}|${c.day}|${c.timetable}|${c.blockIndex}`;
    atOnce.set(key, (atOnce.get(key) || 0) + 1);
  });
  const lengths = new Set(cells.map((c) => c.span));
  // "Everyone" only when the files cover every group in the season (review, 2026-10-16):
  // otherwise the groups of other programs, or ones the files do not show, would be included.
  let who = { keys: [], names: [] };
  if (whole) {
    who = {
      keys: [...new Set(doers.map((g) => keyOf.divisionOf(g)))],
      names: divisions
    };
  } else if (!keyOf.isWholeSeason(eligible)) {
    who = whoOfPool(eligible, divisionOf, keyOf);
  }
  return {
    kind: "activity",
    name,
    length: mostCommon(cells.map((c) => c.span)),
    lengthsVary: lengths.size > 1,
    min: Math.min(...perGroupWeek),
    max: Math.max(...perGroupWeek),
    groupsAtOnce: Math.max(...atOnce.values()),
    who,
    place: onePlace(cells)
  };
}

export { notedNames, campItems };
