/*
 * Groups and their divisions, matched to the camp's by name (add only). A new
 * group goes to the division the file names; where the file names none and the program already
 * has divisions, the director is asked which. A group set up in another division than the file
 * shows is asked about: keep it where it is, or leave it out.
 */
import { LEAVE_OUT } from "./reading";
import { looseKey } from "./text";

export const DEFAULT_DIVISION = "Main";

function campGroups(existing) {
  const byName = new Map();
  for (const entry of (existing && existing.programs) || []) {
    for (const d of entry.divisions || []) {
      for (const g of d.groups || []) {
        byName.set(g.Name, {
          id: g.Id,
          division: d.division.Name,
          divisionId: d.division.Id,
          programId: entry.program.Id,
          programName: entry.program.Name
        });
      }
    }
  }
  return byName;
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

function existingGroup(group, current, divisions, answers, asks) {
  const record = {
    name: group.name,
    key: current.id,
    id: current.id,
    isNew: false,
    divisionKey: current.divisionId,
    division: current.division
  };
  if (
    !group.division ||
    looseKey(group.division) === looseKey(current.division)
  ) {
    return record;
  }
  // Groups are not moved between divisions for now (Group__c.Division__c is set as not
  // reparentable; whether to allow it is Greg's call): keep it, or leave it out.
  const id = `change|group|${group.name}|${group.division}`;
  asks.push({
    id,
    type: "group",
    group: group.name,
    current: current.division,
    file: group.division
  });
  return answers[id] === LEAVE_OUT ? { ...record, leftOut: true } : record;
}

function newGroup(group, divisions, choices, answers, asks) {
  let divisionName = group.division;
  if (!divisionName && choices.length > 0) {
    const id = `division|${group.name}`;
    asks.push({ id, type: "division", group: group.name, options: choices });
    const answer = answers[id];
    if (answer === LEAVE_OUT) {
      return { name: group.name, leftOut: true, isNew: true };
    }
    divisionName = choices.includes(answer) ? answer : choices[0];
  }
  const division = divisions.get(divisionName || DEFAULT_DIVISION);
  return {
    name: group.name,
    key: `G|${group.name}`,
    id: null,
    isNew: true,
    divisionKey: division.key,
    division: division.name
  };
}

/**
 * Every group in the files with its record and division, per timetable: { groups, divisions,
 * divisionOf: Map(group -> division name), asks, notes }. A group the camp has in another
 * program than the one its schedule goes to is left out, and said so.
 */
export function mapGroups(reading, timetables, existing, answers) {
  const camp = campGroups(existing);
  const asks = [];
  const notes = [];
  const groups = [];
  const divisions = [];
  for (const timetable of timetables) {
    if (timetable.leftOut) {
      continue;
    }
    const here = new Divisions(timetable, existing);
    const fileDivisions = reading.groups
      .filter((g) => g.timetable === timetable.index && g.division)
      .map((g) => g.division);
    const choices = [
      ...new Set([...here.known.map((d) => d.name), ...fileDivisions])
    ];
    for (const group of reading.groups.filter(
      (g) => g.timetable === timetable.index
    )) {
      const current = camp.get(group.name);
      const elsewhere =
        current &&
        (!timetable.program || current.programId !== timetable.program.id);
      if (elsewhere) {
        // A group belongs to one program; its schedule from these files would go to another.
        notes.push({
          type: "otherProgram",
          group: group.name,
          program: current.programName,
          to: timetable.name
        });
      }
      const record = elsewhere
        ? { name: group.name, leftOut: true, isNew: false }
        : current
          ? existingGroup(group, current, here, answers, asks)
          : newGroup(group, here, choices, answers, asks);
      groups.push({
        ...record,
        timetable: timetable.index,
        order: group.order
      });
    }
    divisions.push(...here.used.values());
  }
  const divisionOf = new Map(
    groups.filter((g) => !g.leftOut).map((g) => [g.name, g.division])
  );
  return { groups, divisions, divisionOf, asks, notes };
}
