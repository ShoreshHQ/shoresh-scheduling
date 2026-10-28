/*
 * Which group each name means. Camps reuse group names across divisions ("Bunk 1" in Juniors and
 * in Seniors), so a group is its division and its name wherever the division is known. A name
 * used in one division only (in the files and in the camp) is just its name; a name used in
 * several is shown with its division, "Bunk 1 (Seniors)". Where a file names an ambiguous group
 * without its division, the director is asked which one (Greg: never decided silently).
 */
import { FIELD } from "c/shoreshSchema";
import { LEAVE_OUT } from "./reading-constants";
import { looseKey } from "./text";

/** The camp's groups: [{ name, division }]. */
export function campGroupList(existing) {
  const list = [];
  for (const entry of (existing && existing.programs) || []) {
    for (const d of entry.divisions || []) {
      for (const g of d.groups || []) {
        // DIV-1.1: a holding record is no division.
        const none = !!d.division[FIELD.Division.NoDivision];
        list.push({
          name: g.Name,
          division: none ? null : d.division.Name,
          id: g.Id
        });
      }
    }
  }
  return list;
}

/** Every division name the camp has, groups or not. */
function campDivisionNames(existing) {
  return ((existing && existing.programs) || []).flatMap((entry) =>
    (entry.divisions || [])
      .filter((d) => !d.division[FIELD.Division.NoDivision])
      .map((d) => d.division.Name)
  );
}

/** "Bunk 1 (Seniors)": how a group whose name is used in several divisions is shown. */
export function qualified(name, division) {
  return `${name} (${division})`;
}

/**
 * The identity rules for one import: identityOf(name, division) and the divisions a name is
 * used in. Divisions are compared without capitals and spacing.
 */
export function groupIdentities(noted, existing) {
  const divisionsOf = new Map();
  const add = (name, division) => {
    if (!division) {
      return;
    }
    if (!divisionsOf.has(name)) {
      divisionsOf.set(name, new Map());
    }
    const seen = divisionsOf.get(name);
    if (!seen.has(looseKey(division))) {
      seen.set(looseKey(division), division);
    }
  };
  noted.filter((g) => !g.weakDivision).forEach((g) => add(g.name, g.division));
  campGroupList(existing).forEach((g) => add(g.name, g.division));
  // A division only hinted at by a file name ("Camp 2026 - Bunk 3") counts only when it is a
  // division the camp has or a page states, and nothing states another for that group.
  const stated = new Set([
    ...noted
      .filter((g) => !g.weakDivision && g.division)
      .map((g) => looseKey(g.division)),
    ...campDivisionNames(existing).map(looseKey)
  ]);
  noted
    .filter(
      (g) =>
        g.weakDivision &&
        !divisionsOf.has(g.name) &&
        stated.has(looseKey(g.division))
    )
    .forEach((g) => add(g.name, g.division));
  const ambiguous = (name) => (divisionsOf.get(name) || new Map()).size > 1;
  return {
    ambiguous,
    choicesFor: (name) =>
      [...(divisionsOf.get(name) || new Map()).values()]
        .sort()
        .map((d) => qualified(name, d)),
    known: (name, division) =>
      !!division &&
      (divisionsOf.get(name) || new Map()).has(looseKey(division)),
    identityOf: (name, division) => {
      if (!ambiguous(name)) {
        return name;
      }
      const d = division && divisionsOf.get(name).get(looseKey(division));
      return d ? qualified(name, d) : null;
    }
  };
}

/** The division a qualified identity names: "Bunk 1 (Juniors, schedule 2)" -> "Juniors". */
export function divisionOfIdentity(name, identity) {
  if (identity === name || !identity.startsWith(`${name} (`)) {
    return null;
  }
  const inside = identity.slice(name.length + 2, -1).split(", schedule ")[0];
  return inside.startsWith("schedule ") ? null : inside;
}

/** The identity without its schedule: what the camp's records are matched against. */
export function baseIdentity(identity) {
  return identity
    .replace(/ \(schedule \d+\)$/, "")
    .replace(/, schedule \d+\)$/, ")");
}

/**
 * The same division and name in two timetables (two programs, as in program A's "Juniors: Bunk
 * 1" and program B's "Juniors: Bunk 1") are two groups: each gets its schedule's number,
 * "Bunk 1 (Juniors, schedule 2)".
 */
function bySchedule(entries, timetableOfPage) {
  const schedules = new Map();
  for (const e of entries) {
    const t = timetableOfPage.get(e.page);
    schedules.set(
      e.identity,
      new Set([...(schedules.get(e.identity) || []), t])
    );
  }
  return (identity, page) => {
    if ((schedules.get(identity) || new Set()).size < 2) {
      return identity;
    }
    const n = timetableOfPage.get(page) + 1;
    return identity.endsWith(")")
      ? `${identity.slice(0, -1)}, schedule ${n})`
      : `${identity} (schedule ${n})`;
  };
}

/**
 * Every placement and noted group with its group's identity in `group` (and the name as the file
 * wrote it in `recordName`, the identity without its schedule in `base`). An ambiguous name
 * without a division is asked about, once per file: "Which Bunk 1 is this?"; until answered,
 * the first choice stands in; "Leave it out" drops it.
 */
export function identifyGroups(placements, noted, context) {
  const { existing, answers, timetableOfPage } = context;
  const rules = groupIdentities(noted, existing);
  const asks = new Map();
  const resolve = (name, given, file, weak) => {
    // A hinted division that matches nothing stated is no division at all.
    const division = weak && !rules.known(name, given) ? null : given;
    const identity = rules.identityOf(name, division);
    if (identity) {
      return identity;
    }
    const id = `whichGroup|${name}|${file}`;
    const options = rules.choicesFor(name);
    asks.set(id, { id, type: "whichGroup", name, file, options });
    const answer = answers[id];
    if (answer === LEAVE_OUT) {
      return null;
    }
    return options.includes(answer) ? answer : options[0];
  };
  const resolvedNoted = noted
    .map((g) => ({
      ...g,
      identity: resolve(g.name, g.division, g.file, g.weakDivision)
    }))
    .filter((g) => g.identity);
  const scheduled = bySchedule(resolvedNoted, timetableOfPage);
  const kept = placements
    .map((p) => {
      const identity = resolve(p.group, p.division, p.file, p.weakDivision);
      return (
        identity && {
          ...p,
          recordName: p.group,
          base: identity,
          group: scheduled(identity, p.page)
        }
      );
    })
    .filter(Boolean);
  const groups = resolvedNoted.map((g) => {
    // A hint that matches what is known is taken; one that does not is dropped.
    const hinted =
      g.weakDivision && rules.known(g.name, g.division) ? g.division : null;
    const division =
      divisionOfIdentity(g.name, g.identity) ||
      (g.weakDivision ? hinted : g.division);
    // A hint not taken is still offered as a choice, never preselected (round 3).
    const hint = g.weakDivision && !hinted ? g.division : null;
    return {
      ...g,
      recordName: g.name,
      base: g.identity,
      name: scheduled(g.identity, g.page),
      division,
      hint,
      // Taken from a file's name, not stated on a page: a guess, marked after the import.
      fromFileName: !!hinted && division === hinted,
      weakDivision: false
    };
  });
  return { kept, groups, asks: [...asks.values()], rules };
}
