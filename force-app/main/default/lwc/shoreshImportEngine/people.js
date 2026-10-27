/*
 * Groups and their divisions (Greg, 2026-10-16). Every group in the files shows the division it
 * will be in:
 * - a group the camp already has keeps its division, unless the director moves it;
 * - a new group gets the division the file names, preselected and changeable; where the file
 *   names none and the program already has divisions, nothing is preselected and the import
 *   waits for a choice (never a silent "Main"); only a program with no divisions at all, in a
 *   file that names none, starts with one division, Main, shown and changeable.
 * A group is its division and its name (identity.js). Where the file shows a group the camp has
 * in another division (Bunk 3 in Seniors, set up in Juniors), the director chooses: move it,
 * keep it where it is, add a new one, or leave it out; the card says what moving changes.
 */
import { CHILDREN, FIELD } from "c/shoreshSchema";
import { deletedAs, deletionsIn } from "./deleted";
import { LEAVE_OUT } from "./reading-constants";
import { looseKey } from "./text";

export const DEFAULT_DIVISION = "Main";

function campGroups(existing, rules) {
  const byIdentity = new Map();
  const byName = new Map();
  for (const entry of (existing && existing.programs) || []) {
    for (const d of entry.divisions || []) {
      for (const g of d.groups || []) {
        const record = {
          id: g.Id,
          name: g.Name,
          identity: rules.identityOf(g.Name, d.division.Name),
          division: d.division.Name,
          divisionId: d.division.Id,
          programId: entry.program.Id,
          programName: entry.program.Name
        };
        byIdentity.set(record.identity, [
          ...(byIdentity.get(record.identity) || []),
          record
        ]);
        byName.set(g.Name, [...(byName.get(g.Name) || []), record]);
      }
    }
  }
  return { byIdentity, byName };
}

function campDivisions(existing, programId) {
  const entry = ((existing && existing.programs) || []).find(
    (p) => p.program.Id === programId
  );
  return entry
    ? (entry.divisions || []).map((d) => ({
        id: d.division.Id,
        name: d.division.Name
      }))
    : [];
}

class Divisions {
  constructor(timetable, existing) {
    this.timetable = timetable;
    this.known = timetable.program
      ? campDivisions(existing, timetable.program.id)
      : [];
    this.used = new Map();
  }

  /** The division record for a name in this program: the camp's, or a new one. */
  get(name) {
    const key = looseKey(name);
    if (!this.used.has(key)) {
      const found = this.known.find((d) => looseKey(d.name) === key);
      this.used.set(key, {
        key: found ? found.id : `D|${this.timetable.key}|${name}`,
        id: found ? found.id : null,
        programKey: this.timetable.key,
        name: found ? found.name : name,
        isNew: !found
      });
    }
    return this.used.get(key);
  }
}

// ---------- what moving a group changes ----------

/**
 * Activities and recurring activities whose who names a division, leaving out any that also
 * name the group itself (moving does not change those for it).
 */
function whoNaming(existing, divisionId, groupId, otherDivisionId) {
  const names = [];
  // A list naming both divisions keeps the group either way: neither lost nor gained.
  // who: the rows' own fields (who can do an activity, or who a recurring activity covers).
  const counts = (rows, who) =>
    rows.some((r) => r[who.Division] === divisionId) &&
    !rows.some((r) => r[who.Division] === otherDivisionId) &&
    !rows.some((r) => r[who.Group] === groupId);
  for (const a of (existing && existing.activities) || []) {
    if (
      counts(
        a[CHILDREN.Activity.Eligibilities] || [],
        FIELD.ActivityEligibility
      )
    ) {
      names.push(a.Name);
    }
  }
  for (const entry of (existing && existing.programs) || []) {
    for (const r of entry.recurringActivities || []) {
      if (
        counts(r[CHILDREN.RecurringActivity.Coverages] || [], FIELD.Coverage)
      ) {
        names.push(r.Name);
      }
    }
  }
  return names.sort();
}

// ---------- one group ----------

function existingGroup(current, group) {
  return {
    name: group.name,
    base: group.base,
    recordName: current.name,
    key: current.id,
    id: current.id,
    isNew: false,
    divisionKey: current.divisionId,
    division: current.division
  };
}

function newGroup(group, division) {
  return {
    name: group.name,
    base: group.base,
    recordName: group.recordName,
    key: `G|${group.name}`,
    id: null,
    isNew: true,
    divisionKey: division.key,
    division: division.name
  };
}

/** A group the camp has in another division than the file shows: move, keep, add, or leave out. */
function movedGroup(group, other, here, ctx) {
  const canMove =
    !!here.timetable.program && other.programId === here.timetable.program.id;
  const target = canMove
    ? here.known.find((d) => looseKey(d.name) === looseKey(group.division))
    : null;
  const id = `move|${group.recordName}|${other.division}|${group.division}`;
  ctx.asks.push({
    id,
    type: "move",
    group: group.recordName,
    from: other.division,
    to: group.division,
    canMove,
    program: other.programName,
    loses: whoNaming(
      ctx.existing,
      other.divisionId,
      other.id,
      target && target.id
    ),
    gains: target
      ? whoNaming(ctx.existing, target.id, other.id, other.divisionId)
      : []
  });
  const answer = ctx.answers[id];
  if (answer === LEAVE_OUT) {
    return {
      name: group.name,
      recordName: group.recordName,
      leftOut: true,
      isNew: false
    };
  }
  if (answer === "keep" && canMove) {
    return existingGroup(other, group);
  }
  if (answer === "move" && canMove) {
    const to = here.get(group.division);
    return {
      ...existingGroup(other, group),
      moveTo: to.key,
      divisionKey: to.key,
      division: to.name
    };
  }
  return newGroup(group, here.get(group.division));
}

/** The division shown for a new group: preselected only when the file (or nothing else) says. */
function unitChoice(group, here, fileDivisions, ctx) {
  const id = `division|${group.name}`;
  const noUnits = here.known.length === 0 && fileDivisions.length === 0;
  // A division only a lone file's name suggests is offered, never preselected; and Main is not
  // preselected over it (round 3): the director picks.
  const preselected =
    group.division || (noUnits && !group.hint ? DEFAULT_DIVISION : null);
  // A division that already has a group of this name is not offered: choosing it would make a
  // second one (Bunk 1 in Seniors when Seniors has its own Bunk 1).
  // Only this program's groups count: another program's Juniors is another division.
  const programId = here.timetable.program ? here.timetable.program.id : null;
  const taken = new Set(
    [
      ...(ctx.camp.byName.get(group.recordName) || [])
        .filter((o) => o.programId === programId)
        .map((o) => o.division),
      ...(ctx.fileDivisionsOf.get(
        `${here.timetable.index}|${group.recordName}`
      ) || [])
    ]
      .filter((d) => d && looseKey(d) !== looseKey(group.division || ""))
      .map(looseKey)
  );
  const options = [
    ...new Set([
      ...here.known.map((d) => d.name),
      ...fileDivisions,
      ...(group.hint ? [group.hint] : []),
      ...(preselected ? [preselected] : []),
      // A program with no divisions can always start with Main (round 4).
      ...(noUnits ? [DEFAULT_DIVISION] : [])
    ])
  ].filter((d) => !taken.has(looseKey(d)));
  ctx.asks.push({
    id,
    type: "division",
    group: group.name,
    options,
    preselected
  });
  const chosen = ctx.answers[id];
  const answer = chosen || preselected;
  if (answer === LEAVE_OUT) {
    return {
      name: group.name,
      recordName: group.recordName,
      leftOut: true,
      isNew: true
    };
  }
  if (!answer || !options.includes(answer)) {
    return { ...newGroup(group, { key: null, name: null }), unanswered: true };
  }
  if (group.ownDivision && !chosen) {
    // Rule 1, said only when no answer replaced it (names-and-divisions.md).
    ctx.notes.push({ type: "ownDivision", group: group.name });
  }
  return {
    ...newGroup(group, here.get(answer)),
    // Left as the file's name suggested, not chosen: marked for a look after the import.
    divisionGuessed:
      !chosen && !!group.divisionGuessed && answer === group.division
  };
}

function groupRecord(group, here, fileDivisions, ctx) {
  const timetable = here.timetable;
  const programId = timetable.program ? timetable.program.id : null;
  const matches = ctx.camp.byIdentity.get(group.base) || [];
  const current = matches.find((m) => m.programId === programId);
  if (!current && matches.length) {
    // A group belongs to one program; its schedule from these files would go to another.
    const other = matches[0];
    ctx.notes.push({
      type: "otherProgram",
      group: group.name,
      program: other.programName,
      to: timetable.name
    });
    return {
      name: group.name,
      recordName: group.recordName,
      leftOut: true,
      isNew: false
    };
  }
  if (current) {
    return existingGroup(current, group);
  }
  const others = (ctx.camp.byName.get(group.recordName) || []).filter(
    (o) => !ctx.fileIdentities.has(o.identity)
  );
  if (group.division && others.length === 1) {
    return movedGroup(group, others[0], here, ctx);
  }
  // Deleted on a setup screen before: left out, not asked about, until brought back.
  const gone = deletedAs(
    ctx.deletions,
    "Group",
    timetable.name,
    group.recordName
  );
  if (gone) {
    return {
      name: group.name,
      recordName: group.recordName,
      leftOut: true,
      isNew: true,
      deleted: gone
    };
  }
  return unitChoice(group, here, fileDivisions, ctx);
}

/**
 * Every group in the files with its record and division, per timetable: { groups, divisions,
 * divisionOf: Map(group -> division name), asks, notes }. A group the camp has in another
 * program than the one its schedule goes to is left out, and said so.
 */
export function mapGroups(reading, timetables, existing, answers) {
  const ctx = {
    existing,
    answers,
    deletions: deletionsIn(answers),
    asks: [],
    notes: [],
    camp: campGroups(existing, reading.identities),
    fileIdentities: new Set(reading.groups.map((g) => g.base)),
    fileDivisionsOf: reading.groups.reduce((map, g) => {
      const key = `${g.timetable}|${g.recordName}`;
      map.set(key, [...(map.get(key) || []), g.division]);
      return map;
    }, new Map())
  };
  const groups = [];
  const divisions = [];
  for (const timetable of timetables.filter((t) => !t.leftOut)) {
    const here = new Divisions(timetable, existing);
    const mine = reading.groups.filter((g) => g.timetable === timetable.index);
    const fileDivisions = [
      ...new Set(mine.map((g) => g.division).filter(Boolean))
    ];
    for (const group of mine) {
      groups.push({
        ...groupRecord(group, here, fileDivisions, ctx),
        timetable: timetable.index,
        order: group.order
      });
    }
    divisions.push(...here.used.values());
  }
  const divisionOf = new Map(
    groups.filter((g) => !g.leftOut).map((g) => [g.name, g.division])
  );
  return { groups, divisions, divisionOf, asks: ctx.asks, notes: ctx.notes };
}
