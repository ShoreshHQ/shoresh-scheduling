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
 * Why an always-together division is kept as its bunks, or null to read it as one group: the
 * camp already has one of the bunks (its setup wins), a group already has the division's name,
 * or an answer is remembered about one of the bunks (a deleted group, a division, a spelling).
 */
function keptBecause(division, names, others, context) {
  const camp = new Set(context.campGroups || []);
  if (names.some((n) => camp.has(n))) {
    return "existing";
  }
  if (camp.has(division) || others.some((g) => g.name === division)) {
    return "name";
  }
  const remembered = Object.keys(context.answers || {}).some((key) =>
    key.split("|").some((part) => names.includes(part))
  );
  return remembered ? "remembered" : null;
}

/**
 * The placements and groups with each always-together division read as one group, and a note
 * for each such division: { placements, groups, notes: [{ type: "oneGroup", group, bunks,
 * kept }] } (kept: why it stays as its bunks, or null). context: { campGroups, answers }.
 */
export function oneGroupDivisions(placements, groups, context = {}) {
  const merged = new Map();
  const notes = [];
  for (const [key, members] of divisionsOf(groups)) {
    const names = members.map((g) => g.name);
    const division = key.slice(key.indexOf("|") + 1);
    if (names.length >= 2 && alwaysTogether(names, placements)) {
      const others = groups.filter((g) => !names.includes(g.name));
      const kept = keptBecause(division, names, others, context);
      if (!kept) {
        names.forEach((n) => merged.set(n, division));
      }
      notes.push({ type: "oneGroup", group: division, bunks: names, kept });
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
