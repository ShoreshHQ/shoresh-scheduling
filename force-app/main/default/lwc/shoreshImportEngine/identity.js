/*
 * Which group each name means. Camps reuse group names across divisions ("Bunk 1" in Juniors and
 * in Seniors), so a group is its division and its name wherever the division is known. A name
 * used in one division only (in the files and in the camp) is just its name; a name used in
 * several is shown with its division, "Bunk 1 (Seniors)". Where a file names an ambiguous group
 * without its division, the director is asked which one (Greg: never decided silently).
 */
import { LEAVE_OUT } from "./reading-constants";
import { looseKey } from "./text";

/** The camp's groups: [{ name, division }]. */
export function campGroupList(existing) {
  const list = [];
  for (const entry of (existing && existing.programs) || []) {
    for (const d of entry.divisions || []) {
      for (const g of d.groups || []) {
        list.push({ name: g.Name, division: d.division.Name, id: g.Id });
      }
    }
  }
  return list;
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
  // A division only hinted at by a file name counts when nothing states another.
  noted
    .filter((g) => g.weakDivision && !divisionsOf.has(g.name))
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

/**
 * Every placement and noted group with its group's identity in `group` (and the name as the file
 * wrote it in `recordName`). An ambiguous name without a division is asked about, once per file:
 * "Which Bunk 1 is this?"; until answered, the first choice stands in; "Leave it out" drops it.
 */
export function identifyGroups(placements, noted, existing, answers) {
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
  const kept = placements
    .map((p) => ({
      ...p,
      recordName: p.group,
      group: resolve(p.group, p.division, p.file, p.weakDivision)
    }))
    .filter((p) => p.group);
  // A qualified identity carries its division ("Bunk 1 (Seniors)" is in Seniors).
  const divisionIn = (name, identity) => {
    return identity !== name ? identity.slice(name.length + 2, -1) : null;
  };
  const groups = noted
    .map((g) => {
      const identity = resolve(g.name, g.division, g.file, g.weakDivision);
      // A hint that matches what is known is taken; one that does not is dropped.
      const hinted =
        g.weakDivision && rules.known(g.name, g.division) ? g.division : null;
      const division =
        divisionIn(g.name, identity) || (g.weakDivision ? hinted : g.division);
      return (
        identity && {
          ...g,
          recordName: g.name,
          name: identity,
          division,
          weakDivision: false
        }
      );
    })
    .filter(Boolean);
  return { kept, groups, asks: [...asks.values()], rules };
}
