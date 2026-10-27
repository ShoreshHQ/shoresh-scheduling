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
 * Rule 8 needs evidence, as rule 4 does for fixed: the division has cells on two days or more and
 * in three time blocks or more. A one-day or one-block file keeps its bunks.
 */
function enoughEvidence(names, placements) {
  const mine = placements.filter((p) => names.includes(p.group));
  const days = new Set(
    mine.map((p) => `${p.timetable}|${p.week || ""}|${p.day}`)
  );
  const blocks = new Set(mine.map((p) => `${p.timetable}|${p.blockKey}`));
  return days.size >= 2 && blocks.size >= 3;
}

const same = (a, b) =>
  String(a || "").toLowerCase() === String(b || "").toLowerCase();

/** Remembered answers about a group's identity: deleted, its division, which one, a spelling. */
const IDENTITY_ANSWER =
  /^(deleted\|(Program)?Group\||division\||whichGroup\||similar\|group\|)/;

/**
 * Why a division stays as its bunks, or null to read it as one group: the camp already has one
 * of the bunks in that division (its setup wins), another group in the files has the division's
 * name, or an answer about one of the bunks' identity is remembered (so it still applies).
 */
function keptBecause(division, names, others, context) {
  const camp = context.campGroups || [];
  if (
    names.some((n) =>
      camp.some(
        (g) => g.name === n && (!g.division || same(g.division, division))
      )
    )
  ) {
    return "existing";
  }
  if (others.some((g) => g.name === division)) {
    return "name";
  }
  const remembered = Object.keys(context.answers || {}).some(
    (key) =>
      IDENTITY_ANSWER.test(key) &&
      key.split("|").some((part) => names.includes(part))
  );
  return remembered ? "remembered" : null;
}

/**
 * What rule 8 does with one division: { merge, note, ask }. A camp group named as the division
 * (rule 8's own reading last time) is matched again: merged as before, and when the bunks now
 * differ, asked whether to split it, kept as one group until answered.
 */
function decide(division, names, placements, context, others) {
  if (names.length < 2 || !enoughEvidence(names, placements)) {
    return { merge: false };
  }
  const together = alwaysTogether(names, placements);
  const kept = keptBecause(division, names, others, context);
  const before =
    !kept && (context.campGroups || []).some((g) => g.name === division);
  if (before && !together) {
    const id = `split|${division}|${names.join(",")}`;
    const split = (context.answers || {})[id] === "split";
    return {
      merge: !split,
      ask: { id, type: "split", group: division, bunks: names }
    };
  }
  if (!together) {
    return { merge: false };
  }
  return {
    merge: !kept,
    note: { type: "oneGroup", group: division, bunks: names, kept }
  };
}

/**
 * The placements and groups with each always-together division read as one group (rule 8):
 * { placements, groups, notes: [{ type: "oneGroup", group, bunks, kept }], asks: [{ id, type:
 * "split", group, bunks }] }. context: { campGroups: [{ name, division }], answers }.
 */
export function oneGroupDivisions(placements, groups, context = {}) {
  const merged = new Map();
  const notes = [];
  const asks = [];
  for (const [key, members] of divisionsOf(groups)) {
    const names = members.map((g) => g.name);
    const division = key.slice(key.indexOf("|") + 1);
    const others = groups.filter((g) => !names.includes(g.name));
    const d = decide(division, names, placements, context, others);
    if (d.merge) {
      names.forEach((n) => merged.set(n, { to: division, first: names[0] }));
    }
    if (d.note) {
      notes.push(d.note);
    }
    if (d.ask) {
      asks.push(d.ask);
    }
  }
  if (!merged.size) {
    return { placements, groups, notes, asks };
  }
  return { ...regroup(placements, groups, merged), notes, asks };
}

/** The placements and groups with the merged bunks as their division's one group. */
function regroup(placements, groups, merged) {
  // The division's first bunk's cells: the same as every bunk's when they move together, and
  // the ones kept until answered when a group kept as one now differs.
  const firsts = new Set([...merged.values()].map((m) => m.first));
  const kept = placements
    .filter((p) => !merged.has(p.group) || firsts.has(p.group))
    .map((p) => {
      const m = merged.get(p.group);
      return m
        ? { ...p, group: m.to, recordName: m.to, base: m.to, division: null }
        : p;
    });
  const named = new Set();
  const regrouped = [];
  for (const g of groups) {
    const to = merged.has(g.name) ? merged.get(g.name).to : null;
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
    groups: regrouped.map((g, order) => ({ ...g, order }))
  };
}
