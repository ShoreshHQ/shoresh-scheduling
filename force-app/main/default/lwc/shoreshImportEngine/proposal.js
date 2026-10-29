/*
 * The whole proposal: what would be added, what would change (only where the director said so),
 * what is left out and why, what is noted but not set up, and every question still to answer.
 * Pure: the same files and answers always give the same proposal.
 */
import { FIELD } from "c/shoreshSchema";
import {
  activityRecord,
  blockRecordKey,
  campItems,
  decideKinds,
  notedNames,
  setTimeRecords,
  usablePlacements
} from "./items";
import { readAvailability } from "./availability";
import { deletedAs, deletionsIn } from "./deleted";
import { electiveRecords, readElectives } from "./electives";
import { missingItems } from "./missing";
import { identityDivision } from "./noDivision";
import { mapGroups } from "./people";
import { mapPrograms } from "./programs";
import { LEAVE_OUT, readImport } from "./reading";
import { COLOUR_ADD } from "./reading-constants";
import { WEEKDAYS, looseKey } from "./text";
import { versionsFor } from "./version";

const MS_PER_MINUTE = 60000;

/** The camp's groups (as identities, identity.js) in each of its divisions and programs, by Id. */
function campMembers(existing, rules) {
  const members = new Map();
  const season = [];
  for (const entry of (existing && existing.programs) || []) {
    const all = [];
    for (const d of entry.divisions || []) {
      const names = (d.groups || []).map((g) =>
        rules.identityOf(g.Name, identityDivision(d.division))
      );
      members.set(d.division.Id, names);
      all.push(...names);
    }
    members.set(entry.program.Id, all);
    season.push(...all);
  }
  return { members, season };
}

/**
 * Keys of the records a "who" names, and whether a division, a program, or the whole season
 * means only the groups given: the camp may have groups the files do not show, and "Juniors
 * only" or "everyone" would then reach them too.
 */
function keysFor(groups, existing, rules) {
  const kept = groups.filter((g) => !g.leftOut);
  const byName = new Map(kept.map((g) => [g.name, g]));
  const camp = campMembers(existing, rules);
  // The camp knows its groups without a schedule number: compare those.
  const bases = (names) => names.map((n) => (byName.get(n) || {}).base || n);
  const coveredBy = (recordKey, names) => {
    const given = bases(names);
    return (camp.members.get(recordKey) || []).every((n) => given.includes(n));
  };
  const season = [
    ...new Set([...camp.season, ...kept.map((g) => g.base || g.name)])
  ];
  return {
    group: (name) => (byName.get(name) || {}).key,
    divisionOf: (name) => (byName.get(name) || {}).divisionKey,
    coveredBy,
    isWholeSeason: (names) => {
      const given = bases(names);
      return season.every((n) => given.includes(n));
    }
  };
}

// ---------- names the camp already has: asked only where the file disagrees ----------

/**
 * review.md INGEST-5.7: an item an earlier import brought in and no one has changed since is
 * updated from the new file without asking, and listed under "Read as" with "Keep as it is".
 * Anything else the camp has is asked, as before. Returns whether to change it.
 */
function changeOrAsk(id, record, ask, ctx) {
  if (!ctx.imported.has(record.Id)) {
    ctx.asks.push(ask);
    return ctx.answers[id] === "change";
  }
  const answer = ctx.answers[id] === "keep" ? "keep" : "change";
  ctx.notes.push({ ...ask, type: "updated", kind: ask.type, answer });
  return answer === "change";
}

function compareFixed(decision, record, ctx) {
  const t = decision.timetable;
  const p =
    decision.fixedShaped && decision.patterns.length === 1
      ? decision.patterns[0]
      : null;
  if (!p) {
    ctx.notes.push({
      type: "kindDiffers",
      name: decision.name,
      kind: "fixed",
      program: t.name
    });
    return;
  }
  const blockId = t.blocks[p.block].id;
  const fixed = FIELD.FixedActivity;
  if (
    blockId === record[fixed.TimeBlock] &&
    p.length === record[fixed.Length]
  ) {
    return;
  }
  const id = `change|fixed|${t.name}|${decision.name}|${t.blocks[p.block].name}|${p.length}`;
  const ask = {
    id,
    type: "fixed",
    name: decision.name,
    program: t.name,
    record,
    block: t.blocks[p.block],
    length: p.length,
    timetable: t
  };
  if (changeOrAsk(id, record, ask, ctx)) {
    ctx.updates.fixed.push({
      id: record.Id,
      auto: ctx.imported.has(record.Id),
      blockKey: blockRecordKey(t, p.block),
      length: p.length,
      name: decision.name
    });
  }
}

function sameDays(record, days) {
  return WEEKDAYS.every(
    (d) => !!record[FIELD.RecurringActivity[d]] === days.includes(d)
  );
}

function compareRecurring(decision, record, ctx) {
  const t = decision.timetable;
  if (decision.patterns.length !== 1 || decision.strays.length > 0) {
    ctx.notes.push({
      type: "kindDiffers",
      name: decision.name,
      kind: "recurring",
      program: t.name
    });
    return;
  }
  const p = decision.patterns[0];
  const blockId = t.blocks[p.block].id;
  if (
    blockId === record[FIELD.RecurringActivity.TimeBlock] &&
    p.length === record[FIELD.RecurringActivity.Length] &&
    sameDays(record, p.days)
  ) {
    return;
  }
  const days = WEEKDAYS.filter((d) => p.days.includes(d));
  const id = `change|recurring|${t.name}|${decision.name}|${t.blocks[p.block].name}|${p.length}|${days.join(",")}`;
  const ask = {
    id,
    type: "recurring",
    name: decision.name,
    program: t.name,
    record,
    block: t.blocks[p.block],
    length: p.length,
    days,
    timetable: t
  };
  if (changeOrAsk(id, record, ask, ctx)) {
    ctx.updates.recurring.push({
      id: record.Id,
      auto: ctx.imported.has(record.Id),
      blockKey: blockRecordKey(t, p.block),
      length: p.length,
      days,
      name: decision.name
    });
  }
}

function compareActivity(name, cells, record, ctx) {
  const lengths = cells.map((c) => c.span);
  const length = lengths.sort(
    (a, b) =>
      lengths.filter((x) => x === b).length -
        lengths.filter((x) => x === a).length || a - b
  )[0];
  if (length === record[FIELD.Activity.Length]) {
    return;
  }
  const id = `change|activity|${name}|${length}`;
  if (
    changeOrAsk(id, record, { id, type: "activity", name, record, length }, ctx)
  ) {
    ctx.updates.activities.push({
      id: record.Id,
      length,
      name,
      auto: ctx.imported.has(record.Id)
    });
  }
}

// ---------- building the records ----------

function setTimeFrom(decisions, ctx, keyOf) {
  const added = [];
  for (const d of decisions) {
    if (d.leftOut || d.kind === "activity") {
      continue;
    }
    if (d.existing) {
      const key = `${d.timetable.program.id}|${d.name}`;
      if (d.kind === "fixed") {
        compareFixed(d, ctx.camp.fixed.get(key), ctx);
      } else {
        compareRecurring(d, ctx.camp.recurring.get(key), ctx);
      }
      continue;
    }
    added.push(...setTimeRecords(d, keyOf));
  }
  return added;
}

/** Where a name is something other than an activity in another program, say so. */
function noteMixedKinds(name, decisions, ctx) {
  const kinds = decisions.filter((d) => d.name === name && !d.leftOut);
  if (new Set(kinds.map((d) => d.kind)).size > 1) {
    ctx.notes.push({
      type: "mixedKinds",
      name,
      places: kinds.map((d) => ({ kind: d.kind, program: d.timetable.name }))
    });
  }
}

/**
 * Activities, each from its placements in the programs where it is an activity (not where it
 * is fixed, recurring, or left out), counting the groups of those programs.
 */
function activitiesFrom(decisions, usable, groups, ctx, keyOf) {
  const asActivity = decisions.filter(
    (d) => d.kind === "activity" && !d.leftOut
  );
  const names = [...new Set(asActivity.map((d) => d.name))].sort();
  const divisionOf = new Map(groups.map((g) => [g.name, g.division]));
  const added = [];
  for (const name of names) {
    const where = new Set(
      asActivity.filter((d) => d.name === name).map((d) => d.timetable.index)
    );
    const cells = usable.filter(
      (p) => p.text === name && where.has(p.timetable)
    );
    const pool = groups
      .filter((g) => !g.leftOut && where.has(g.timetable))
      .map((g) => g.name);
    noteMixedKinds(name, decisions, ctx);
    const existing = ctx.camp.activities.get(name);
    if (existing) {
      compareActivity(name, cells, existing, ctx);
    } else {
      added.push(activityRecord(name, cells, pool, divisionOf, keyOf));
    }
  }
  return added;
}

/**
 * INGEST-2.19: an activity a file showed only by colour ("Blue = Swim" under the grid, its cells
 * blank on export) is asked, never read as free time without a word. "Add" brings it in as an
 * activity with no times yet (its cells stay empty, to place on the schedule); "Leave it out",
 * or no answer yet, adds nothing. A name the files also write in cells, or the camp has, is not
 * asked. Returns the activities added.
 */
function colourOnly(reading, usable, ctx) {
  const written = new Set(usable.map((p) => looseKey(p.text)));
  const added = [];
  const seen = new Set();
  for (const key of reading.colours || []) {
    const id = `colour|${key.name}`;
    if (
      seen.has(id) ||
      written.has(looseKey(key.name)) ||
      ctx.camp.activities.has(key.name)
    ) {
      continue;
    }
    seen.add(id);
    ctx.asks.push({ id, type: "colour", ...key });
    if (ctx.answers[id] === COLOUR_ADD) {
      added.push({
        kind: "activity",
        name: key.name,
        length: 1,
        lengthsVary: false,
        min: 0,
        max: 1,
        groupsAtOnce: 1,
        who: { keys: [], names: [] },
        place: null
      });
    }
  }
  return added;
}

/** Places named in the file: the camp's (matched by name), or new ones only if ticked. */
/** The most groups the file has at a place at once: how many must fit there. */
function groupsAtOncePer(usable) {
  const counts = new Map();
  for (const p of usable.filter((x) => x.place)) {
    const key = `${p.place}|${p.week}|${p.day}|${p.timetable}|${p.blockIndex}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const most = new Map();
  for (const [key, n] of counts) {
    const place = key.split("|")[0];
    most.set(place, Math.max(most.get(place) || 1, n));
  }
  return most;
}

function placesFor(records, existing, answers, usable) {
  const fits = groupsAtOncePer(usable);
  const deletions = deletionsIn(answers);
  const deleted = [];
  const camp = new Map(
    ((existing && existing.locations) || []).map((l) => [l.Name, l.Id])
  );
  const offered = [];
  const locations = [];
  for (const name of [
    ...new Set(records.map((r) => r.place).filter(Boolean))
  ].sort()) {
    if (camp.has(name)) {
      locations.push({
        name,
        key: camp.get(name),
        id: camp.get(name),
        isNew: false
      });
      continue;
    }
    const id = `place|${name}`;
    // Deleted on a setup screen before: not offered until brought back (Bring back ticks it).
    const gone = deletedAs(deletions, "Location", "", name);
    if (gone) {
      deleted.push({ key: gone, kind: "Location", name, program: "" });
      continue;
    }
    const ticked = answers[id] === "add";
    offered.push({
      id,
      name,
      ticked,
      usedBy: records.filter((r) => r.place === name).map((r) => r.name)
    });
    if (ticked) {
      locations.push({
        name,
        key: `L|${name}`,
        id: null,
        isNew: true,
        groupsThatFit: fits.get(name) || 1
      });
    }
  }
  const keyOfPlace = new Map(locations.map((l) => [l.name, l.key]));
  records.forEach((r) => {
    r.locationKey = keyOfPlace.get(r.place) || null;
  });
  return { offered, locations, deleted };
}

function leftOutNames(decisions) {
  return [
    ...new Set(
      decisions.filter((d) => d.leftOut && !d.deleted).map((d) => d.name)
    )
  ].sort();
}

/**
 * What the camp deleted before and this import leaves out (Greg, decision 45), each once:
 * [{ key (the remembered question, answered BRING_BACK to bring it back), kind, name, program }].
 */
function deletedItems(decisions, groups, timetables, places) {
  const all = [
    ...decisions
      .filter((d) => d.deleted)
      .map((d) => ({
        key: d.deleted.key,
        kind: d.deleted.kind,
        name: d.name,
        program: d.deleted.kind === "Activity" ? "" : d.timetable.name
      })),
    ...groups
      .filter((g) => g.deleted)
      .map((g) => ({
        key: g.deleted,
        kind: "Group",
        name: g.recordName,
        program: (timetables[g.timetable] || {}).name || ""
      })),
    ...timetables
      .filter((t) => t.deleted)
      .map((t) => ({
        key: t.deleted,
        kind: "Program",
        name: t.name,
        program: ""
      })),
    ...timetables.flatMap((t) =>
      t.blocks
        .filter((b) => b.deleted)
        .map((b) => ({
          key: b.deleted,
          kind: "TimeBlock",
          name: b.name,
          program: t.name
        }))
    ),
    ...places
  ];
  const byKey = new Map();
  all.forEach((item) => byKey.set(item.key, byKey.get(item.key) || item));
  return [...byKey.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key)
  );
}

function notedList(usable, kinds) {
  const result = new Map();
  for (const p of usable) {
    const kind = kinds.get(p.text);
    // Electives are set up (electives.js), not noted.
    if (kind && kind !== "E") {
      const entry = result.get(p.text) || {
        name: p.text,
        kind,
        days: new Set(),
        groups: new Set()
      };
      entry.days.add(p.day);
      entry.groups.add(p.group);
      result.set(p.text, entry);
    }
  }
  return [...result.values()]
    .map((e) => ({
      name: e.name,
      kind: e.kind,
      days: WEEKDAYS.filter((d) => e.days.has(d)),
      groups: e.groups.size
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Everything about one import, with the answers given so far.
 * input: { files, existing, terms, answers, layouts }.
 */
/**
 * Activity names still asked as similar ("Swim Return" / "Swim Returning"): Map(name -> Set of
 * the names it may be). Until answered they stay apart, but one may complete a division (rule 6).
 */
function unansweredSimilar(pairs, answers) {
  const similar = new Map();
  const add = (a, b) => similar.set(a, (similar.get(a) || new Set()).add(b));
  for (const pair of pairs) {
    if (pair.kind === "activity" && !pair.existing && !answers[pair.id]) {
      add(pair.a, pair.b);
      add(pair.b, pair.a);
    }
  }
  return similar;
}

/**
 * The days set times leave out of "every day": the noted special days, and each week's day with
 * its own time blocks (INGEST-4.3), which comes in as a special day.
 */
function withOwnDays(specialDays, timetables) {
  const result = new Map(specialDays);
  timetables.forEach((t) =>
    (t.ownDays || []).forEach((o) =>
      result.set(`${t.index}|${o.week}|${o.day}`, true)
    )
  );
  return result;
}

export function buildProposal(input) {
  const answers = input.answers || {};
  const reading = readImport(input);
  const programs = mapPrograms(reading, input.existing, answers);
  const people = mapGroups(
    reading,
    programs.timetables,
    input.existing,
    answers
  );
  const { usable, leftOut } = usablePlacements(
    reading,
    programs.timetables,
    people.groups
  );
  // INGEST-2.9: a new group here only for the morning (or the afternoon).
  const availability = readAvailability(
    usable,
    programs.timetables,
    people.groups,
    answers
  );
  const camp = campItems(input.existing);
  const deletions = deletionsIn(answers);
  // Electives first (slice E9): an elective set is not a fixed, recurring or activity name.
  const electives = readElectives(usable, {
    timetables: programs.timetables,
    terms: input.terms,
    answers,
    existing: input.existing,
    deletions,
    camp
  });
  const noted = notedNames(
    usable,
    programs.timetables,
    input.terms,
    electives.texts
  );
  const ctx = {
    camp,
    // Items an earlier import brought in, untouched since (ImportController.getImported).
    imported: new Set(input.imported || []),
    // Why an untouched item is still in use (ImportController.getImported): never removed.
    inUse: input.inUse || {},
    timetables: programs.timetables,
    answers,
    deletions,
    asks: [],
    notes: [...reading.notes, ...people.notes],
    updates: { fixed: [], recurring: [], activities: [] },
    specialDays: withOwnDays(noted.specialDays, programs.timetables),
    divisionOf: people.divisionOf,
    availability,
    baseOf: new Map(people.groups.map((g) => [g.name, g.base || g.name])),
    noted: noted.kinds,
    similar: unansweredSimilar(reading.pairs, answers)
  };
  const decisions = decideKinds(usable, ctx);
  const keyOf = keysFor(people.groups, input.existing, reading.identities);
  const setTime = setTimeFrom(decisions, ctx, keyOf);
  const activities = activitiesFrom(
    decisions,
    usable,
    people.groups,
    ctx,
    keyOf
  );
  // The offerings the sets read need, their activities, and the double periods linked.
  const electiveAdds = electiveRecords(electives, {
    timetables: programs.timetables,
    groups: people.groups,
    deletions,
    existing: input.existing,
    keyOf,
    divisionOf: new Map(people.groups.map((g) => [g.name, g.division])),
    activities,
    activityRecord
  });
  activities.push(...electiveAdds.activities);
  activities.push(...colourOnly(reading, usable, ctx));
  const places = placesFor(
    [...setTime, ...activities],
    input.existing,
    answers,
    usable
  );
  const proposal = {
    reading,
    usable,
    camp: ctx.camp,
    notedKinds: noted.kinds,
    timetables: programs.timetables,
    groups: people.groups,
    availability,
    divisions: people.divisions,
    fixed: setTime.filter((r) => r.kind === "fixed"),
    recurring: setTime.filter((r) => r.kind === "recurring"),
    activities,
    locations: places.locations,
    offeredPlaces: places.offered,
    updates: ctx.updates,
    noted: notedList(usable, noted.kinds),
    electives,
    leftOutNames: leftOutNames(decisions),
    deleted: deletedItems(decisions, people.groups, programs.timetables, [
      ...places.deleted,
      ...electives.deleted,
      ...electiveAdds.deleted
    ]),
    leftOutCells: leftOut,
    notes: ctx.notes,
    asks: [...programs.asks, ...people.asks, ...electives.asks, ...ctx.asks],
    decisions
  };
  const last = versionsFor(proposal, input);
  // review.md INGEST-5.8: what an earlier import brought in that these files lack.
  proposal.missing = missingItems({
    existing: input.existing,
    imported: ctx.imported,
    inUse: ctx.inUse,
    answers,
    usable,
    decisions,
    electives,
    timetables: programs.timetables,
    versionUses: input.versionUses || {},
    versions: last.versions
  });
  return {
    ...proposal,
    versions: last.versions,
    unmatched: last.unmatched,
    noWeeks: last.noWeeks,
    fillWeeks: last.fillWeeks,
    specialDays: last.specialDays,
    notes: [...proposal.notes, ...last.notes],
    asks: [...proposal.asks, ...last.asks]
  };
}

export { MS_PER_MINUTE, LEAVE_OUT };
