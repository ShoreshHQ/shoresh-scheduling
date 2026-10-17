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
        byIdentity.set(record.identity, record);
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

function whoNaming(existing, divisionId) {
  const names = [];
  for (const a of (existing && existing.activities) || []) {
    if ((a.Eligibilities__r || []).some((e) => e.Division__c === divisionId)) {
      names.push(a.Name);
    }
  }
  for (const entry of (existing && existing.programs) || []) {
    for (const r of entry.recurringActivities || []) {
      if ((r.Coverages__r || []).some((c) => c.Division__c === divisionId)) {
        names.push(r.Name);
      }
    }
  }
  return names.sort();
}

// ---------- one group ----------

function existingGroup(current) {
  return {
    name: current.identity,
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
    loses: whoNaming(ctx.existing, other.divisionId),
    gains: target ? whoNaming(ctx.existing, target.id) : []
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
  if (answer === "keep") {
    return { ...existingGroup(other), name: group.name };
  }
  if (answer === "move" && canMove) {
    const to = here.get(group.division);
    return {
      ...existingGroup(other),
      name: group.name,
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
  const preselected = group.division || (noUnits ? DEFAULT_DIVISION : null);
  const options = [
    ...new Set([
      ...here.known.map((d) => d.name),
      ...fileDivisions,
      ...(preselected ? [preselected] : [])
    ])
  ];
  ctx.asks.push({
    id,
    type: "division",
    group: group.name,
    options,
    preselected
  });
  const answer = ctx.answers[id] || preselected;
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
  return newGroup(group, here.get(answer));
}

function groupRecord(group, here, fileDivisions, ctx) {
  const current = ctx.camp.byIdentity.get(group.name);
  const timetable = here.timetable;
  if (
    current &&
    (!timetable.program || current.programId !== timetable.program.id)
  ) {
    // A group belongs to one program; its schedule from these files would go to another.
    ctx.notes.push({
      type: "otherProgram",
      group: group.name,
      program: current.programName,
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
    return existingGroup(current);
  }
  const others = (ctx.camp.byName.get(group.recordName) || []).filter(
    (o) => !ctx.fileIdentities.has(o.identity)
  );
  if (group.division && others.length === 1) {
    return movedGroup(group, others[0], here, ctx);
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
    asks: [],
    notes: [],
    camp: campGroups(existing, reading.identities),
    fileIdentities: new Set(reading.groups.map((g) => g.name))
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
