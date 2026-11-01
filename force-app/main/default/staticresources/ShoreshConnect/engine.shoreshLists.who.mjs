/*
 * Who an item is for, written as names in one cell: divisions and groups ("Juniors, Bunk 5").
 * A name that two records share is written with what tells them apart: a division with its
 * program ("Juniors (Main)"), a group with its division ("Bunk 1 (Juniors)") or its division and
 * program ("Bunk 1 (Juniors, Main)"). A name that still fits two records is not guessed: the row
 * says which spellings would be clear.
 */
import { looseKey, holdsNoDivision } from "./engine.shoreshImportEngine.shoreshImportEngine.mjs";

const EVERYONE = new Set(["everyone", "everybody", "all", "all groups"]);

/** Every division and group in the season, with the spellings that can name each. */
export function whoTargets(setup) {
  const targets = [];
  ((setup && setup.programs) || []).forEach((entry) => {
    const program = entry.program.Name;
    (entry.divisions || []).forEach((d) => {
      // DIV-1.1: a holding record is no division; its group is named alone or with its program.
      const none = holdsNoDivision(d.division);
      const division = d.division.Name;
      if (!none) {
        targets.push({
          id: d.division.Id,
          kind: "Division",
          programId: entry.program.Id,
          spellings: [division, `${division} (${program})`]
        });
      }
      (d.groups || []).forEach((g) => {
        targets.push({
          id: g.Id,
          kind: "Group",
          programId: entry.program.Id,
          spellings: none
            ? [g.Name, `${g.Name} (${program})`]
            : [
                g.Name,
                `${g.Name} (${division})`,
                `${g.Name} (${division}, ${program})`
              ]
        });
      });
    });
  });
  const bySpelling = new Map();
  targets.forEach((target) => {
    target.spellings.forEach((spelling) => {
      const key = looseKey(spelling);
      bySpelling.set(key, [...(bySpelling.get(key) || []), target]);
    });
  });
  const byId = new Map();
  targets.forEach((target) => {
    // The shortest spelling that names only this record.
    // Never a word a list reads as everyone ("All", "Everyone"): the longer name then.
    target.name =
      target.spellings.find(
        (s) =>
          bySpelling.get(looseKey(s)).length === 1 && !EVERYONE.has(looseKey(s))
      ) || target.spellings[target.spellings.length - 1];
    byId.set(target.id, target);
  });
  return { bySpelling, byId };
}

/**
 * The records the names in a cell stand for: { ids } (sorted, so the same names always give the
 * same list), or { problem }.
 */
export function resolveWho(names, targets) {
  const ids = [];
  for (const name of names) {
    const found = targets.bySpelling.get(looseKey(name)) || [];
    if (found.length === 0) {
      return { problem: `no “${name}”` };
    }
    if (found.length > 1) {
      return {
        problem: `“${name}”: write ${found
          .map((t) => `“${t.name}”`)
          .join(" or ")}`
      };
    }
    if (!ids.includes(found[0].id)) {
      ids.push(found[0].id);
    }
  }
  return { ids: ids.sort() };
}

/** Ids as the names a cell would show, in a fixed order. */
export function whoNames(ids, targets) {
  return (ids || [])
    .map((id) => (targets.byId.get(id) || { name: "?" }).name)
    .sort((a, b) => a.localeCompare(b));
}
