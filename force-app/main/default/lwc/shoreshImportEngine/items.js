/*
 * What each name becomes: a fixed activity, recurring activities, an activity, or something
 * noted but not set up (an elective, special day, special event, or trip). Names the camp
 * already has keep the kind they have (fixed, recurring, and activity are mutually exclusive);
 * where the file disagrees with them, the director is asked whether to change them.
 */
import { classifyName, notedKindByWords, specialDayNames } from "./classify";
import { LEAVE_OUT } from "./reading";
import { WEEKDAYS } from "./text";

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

/** Names noted but not set up, with their kind, and the special days to leave out of "every day". */
function notedNames(usable, timetables, terms) {
  const kinds = new Map();
  const specialDays = new Map();
  for (const p of usable) {
    const kind = notedKindByWords(p.text, terms);
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

function timetableFacts(t, usable, specialDays, divisionOf) {
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
  return { groups, divisionOf, daysByWeek, weeks };
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

function verdictFor(name, t, facts, cells, ctx) {
  const decided = classifyName(cells, facts);
  const known = existingKind(name, t, ctx.camp);
  if (known) {
    return { ...decided, kind: known, existing: true };
  }
  if (decided.verdict !== "ask") {
    return { ...decided, kind: decided.verdict };
  }
  const several = ctx.timetables.filter((x) => !x.leftOut).length > 1;
  const id = `kind|${name}${several ? `|${t.name}` : ""}`;
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

/** Each name in each timetable: { name, timetable, kind, patterns, strays, existing, leftOut }. */
export function decideKinds(usable, ctx) {
  const results = [];
  for (const t of ctx.timetables.filter((x) => !x.leftOut)) {
    const facts = timetableFacts(t, usable, ctx.specialDays, ctx.divisionOf);
    const byName = new Map();
    for (const p of usable.filter(
      (x) => x.timetable === t.index && !ctx.noted.has(x.text)
    )) {
      if (!byName.has(p.text)) {
        byName.set(p.text, []);
      }
      byName.get(p.text).push(p);
    }
    for (const [name, cells] of [...byName].sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      results.push({
        name,
        timetable: t,
        facts,
        cells,
        ...verdictFor(name, t, facts, cells, ctx)
      });
    }
  }
  return results;
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
    divisions.every((d) =>
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

export function setTimeRecords(decision, keyOf) {
  const t = decision.timetable;
  const place = onePlace(decision.cells);
  if (decision.kind === "fixed") {
    const p =
      decision.patterns.find(
        (x) => x.groups.length === decision.facts.groups.length
      ) || decision.patterns[0];
    return [
      {
        kind: "fixed",
        name: decision.name,
        timetable: t,
        programKey: t.key,
        block: p.block,
        blockKey: blockRecordKey(t, p.block),
        length: p.length,
        place
      }
    ];
  }
  return decision.patterns.map((p) => ({
    kind: "recurring",
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
export function activityRecord(name, cells, allGroups, divisionOf, keyOf) {
  const doers = [...new Set(cells.map((c) => c.group))];
  const divisions = [...new Set(doers.map((g) => divisionOf.get(g)))];
  const inDivisions = allGroups.filter((g) =>
    divisions.includes(divisionOf.get(g))
  );
  const whole =
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
  return {
    kind: "activity",
    name,
    length: mostCommon(cells.map((c) => c.span)),
    lengthsVary: lengths.size > 1,
    min: Math.min(...perGroupWeek),
    max: Math.max(...perGroupWeek),
    groupsAtOnce: Math.max(...atOnce.values()),
    who: whole
      ? {
          keys: [...new Set(doers.map((g) => keyOf.divisionOf(g)))],
          names: divisions
        }
      : { keys: [], names: [] },
    place: onePlace(cells)
  };
}

export { notedNames, campItems };
