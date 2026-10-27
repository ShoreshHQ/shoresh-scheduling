/*
 * Rule 8 (Greg 2026-10-27, docs/import/classification.md): "if all groups in a division are moving at the same time to
 * activities, then there is really 1 group in the division. So they really just don't have
 * divisions, they have groups." A division whose bunks have the very same cell in every time
 * block of the files is read as one group, named as the division, with no division of its own;
 * the import says so (a note), never silently. A division whose bunks differ in even one block
 * stays a division of bunks. Blocks where the whole division has nothing (away, a trip off the
 * grid) do not count; a block where one bunk has a cell and another has none is a difference.
 */

function slotKey(p) {
  return `${p.timetable}|${p.week || ""}|${p.day}|${p.blockKey}|${p.span}`;
}

/** Each division's groups, in the files' order: Map("timetable|division" -> [group]). */
function divisionsOf(groups) {
  const byDivision = new Map();
  for (const g of groups) {
    if (g.division) {
      const key = `${g.timetable}|${g.division}`;
      byDivision.set(key, [...(byDivision.get(key) || []), g]);
    }
  }
  return byDivision;
}

/** Whether every group of the list has the same cells, block by block. */
function alwaysTogether(names, placements) {
  const cells = new Map(names.map((n) => [n, new Map()]));
  for (const p of placements) {
    if (cells.has(p.group)) {
      const mine = cells.get(p.group);
      const key = slotKey(p);
      mine.set(key, [...(mine.get(key) || []), p.text].sort().join("\n"));
    }
  }
  const [first, ...rest] = names.map((n) => cells.get(n));
  if (first.size === 0) {
    return false;
  }
  return rest.every(
    (m) => m.size === first.size && [...first].every(([k, v]) => m.get(k) === v)
  );
}

/**
 * The placements and groups with each always-together division read as one group:
 * { placements, groups, notes: [{ type: "oneGroup", group, bunks }] }.
 */
export function oneGroupDivisions(placements, groups) {
  const merged = new Map();
  const notes = [];
  for (const [key, members] of divisionsOf(groups)) {
    const names = members.map((g) => g.name);
    const division = key.slice(key.indexOf("|") + 1);
    // A name already a group elsewhere would join two different groups: left as it is.
    const clash = groups.some(
      (g) => g.name === division && !names.includes(g.name)
    );
    if (names.length >= 2 && !clash && alwaysTogether(names, placements)) {
      names.forEach((n) => merged.set(n, division));
      notes.push({ type: "oneGroup", group: division, bunks: names });
    }
  }
  if (!merged.size) {
    return { placements, groups, notes };
  }
  const seen = new Set();
  const kept = [];
  for (const p of placements) {
    const to = merged.get(p.group);
    if (!to) {
      kept.push(p);
      continue;
    }
    const key = `${slotKey(p)}|${p.text}|${to}`;
    if (!seen.has(key)) {
      seen.add(key);
      kept.push({ ...p, group: to, recordName: to, base: to, division: null });
    }
  }
  const named = new Set();
  const regrouped = [];
  for (const g of groups) {
    const to = merged.get(g.name);
    if (!to) {
      regrouped.push(g);
    } else if (!named.has(to)) {
      named.add(to);
      regrouped.push({
        ...g,
        name: to,
        recordName: to,
        base: to,
        division: null,
        divisionGuessed: false,
        hint: null
      });
    }
  }
  return {
    placements: kept,
    groups: regrouped.map((g, order) => ({ ...g, order })),
    notes
  };
}
