/**
 * Manual Build's day and week tools (Greg, Manual Build round 2, decisions 6 and 7): Clear day,
 * Clear week and Copy day to…, worked out as runs like any other edit (moves.js), so they save
 * through the same slot-by-slot checks and are one Undo step each. Only what Undo can put back
 * changes: an activity still in setup, at a time its group is at camp. Fixed and recurring
 * activities stay where setup put them. Anything else that stays is said: an activity deleted
 * since, one placed where its group is no longer at camp, or something not set up yet (an
 * imported elective, say). A position's day and group are indexes into the schedule's days and
 * that day's groups.
 *
 * Options: isAway(day, group, block) says a group isn't at camp in a block; skip(day, group,
 * block) marks a cell the tool must leave as it is (someone else changed it since the director
 * looked, ADR 0008 §24); both indexes on the day the tool changes.
 */
import { OPEN, owner, placementIn, slots } from "./slotEdits";
import { Rows } from "./moves";
import { markOf, planRain } from "./rain";

const CARRIES_ON = "^";

/** Why something was left as it was (the page puts it into words). */
export const LEFT_OUT = Object.freeze({
  // The group isn't on the target day.
  NO_GROUP: "noGroup",
  // The target day doesn't have one of its time blocks (`missing`, an index on the source day).
  NO_BLOCK: "noBlock",
  // Something that stays is there on the target day (its slot is `blocking`).
  TAKEN: "taken",
  // The group isn't at camp then.
  AWAY: "away",
  // Deleted from setup since it was placed.
  GONE: "gone",
  // Not set up yet (an imported elective, say): only activities can be placed.
  NOT_SET_UP: "notSetUp",
  // Pasted where the grid has no room for it (past its last time block or column, or where the
  // day lacks a block it runs into).
  NO_ROOM: "noRoom"
});

const never = () => false;

/** Whether an activity placed in a day's slot has been deleted from setup since. */
function gone(day, slot) {
  const id = owner(slot).slice(2);
  const item = day.items.find((i) => i.kind === "A" && i.id === id);
  return !!(item && item.gone);
}

const isSetTime = (slot) => slot.startsWith("F:") || slot.startsWith("R:");

/**
 * What a tool may clear, copy or paste: an activity, or a special event placed on the grid (its
 * record's Id after "S:", ADR 0014 slice 4); not something noted from a file by name.
 */
const PLACED_EVENT = /^S:[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
const isPlaceable = (slot) => slot.startsWith("A:") || PLACED_EVENT.test(slot);

/**
 * A group's day sorted: the placements Undo could put back (`clear`), the ones that stay and why
 * (`stayed`: { first, slot, why }), and where someone else's are (`skipped`: first blocks). Fixed and
 * recurring activities are none of these.
 */
function sortRow(day, row, isAwayAt, skipAt) {
  const result = { clear: [], stayed: [], skipped: [] };
  row.forEach((slot, b) => {
    if (!slot || slot.startsWith(CARRIES_ON) || isSetTime(slot)) {
      return;
    }
    const p = placementIn(row, b);
    const blocks = [...Array(p.length).keys()].map((i) => b + i);
    let why = null;
    if (!isPlaceable(slot)) {
      why = LEFT_OUT.NOT_SET_UP;
    } else if (gone(day, slot)) {
      why = LEFT_OUT.GONE;
    } else if (blocks.some(isAwayAt)) {
      why = LEFT_OUT.AWAY;
    }
    if (why) {
      result.stayed.push({ first: b, slot, why });
    } else if (blocks.some(skipAt)) {
      result.skipped.push(b);
    } else {
      result.clear.push(p);
    }
  });
  return result;
}

function clearPlacements(row, placements) {
  placements.forEach((p) => {
    for (let i = 0; i < p.length; i++) {
      row[p.first + i] = OPEN;
    }
  });
}

/**
 * Clears the activities of the given days (indexes), for every group, or for one group (its Id)
 * when `groupId` is given. Returns { runs, stayed: [{ day, group, block, slot, why }], skipped }.
 */
export function clearEdit(days, dayIndexes, options = {}) {
  const { groupId, isAway = never, skip = never } = options;
  const rows = new Rows(days);
  const stayed = [];
  const skipped = new Set();
  dayIndexes.forEach((d) => {
    const day = days[d];
    if (!day || day.problem) {
      return;
    }
    day.groups.forEach((grp, g) => {
      if (groupId && grp.id !== groupId) {
        return;
      }
      const row = rows.get(d, g);
      const sorted = sortRow(
        day,
        row,
        (b) => isAway(d, g, b),
        (b) => skip(d, g, b)
      );
      clearPlacements(row, sorted.clear);
      sorted.stayed.forEach((s) =>
        stayed.push({
          day: d,
          group: g,
          block: s.first,
          slot: s.slot,
          why: s.why
        })
      );
      sorted.skipped.forEach((b) => skipped.add(`${d}|${g}|${b}`));
    });
  });
  return { runs: rows.runs(), stayed, skipped: skipped.size };
}

/**
 * Copies one day's activities onto other days of the week (indexes): on each target day, each
 * group's activities (those Undo could put back) are replaced by the ones it has on the source
 * day, at the same time blocks. Groups and blocks are matched by Id; a group on the target day
 * but not the source keeps its own. A source item already the same on the target needs nothing;
 * any other that can't go is left out whole and listed: { day, group (source index), block
 * (source index), slot, why (LEFT_OUT), blocking (TAKEN), missing (NO_BLOCK) }. Returns
 * { runs, leftOut, skipped }.
 */
export function copyDayEdit(days, from, targets, options = {}) {
  const { isAway = never, skip = never } = options;
  const rows = new Rows(days);
  const leftOut = [];
  // Someone else's cells left as they are, each counted once.
  const skipped = new Set();
  const source = days[from];
  targets.forEach((t) => {
    const target = days[t];
    if (!target || target.problem || t === from) {
      return;
    }
    source.groups.forEach((grp, sg) => {
      const tg = target.groups.findIndex((x) => x.id === grp.id);
      const row = tg < 0 ? null : rows.get(t, tg);
      if (row) {
        const sorted = sortRow(
          target,
          row,
          (b) => isAway(t, tg, b),
          (b) => skip(t, tg, b)
        );
        clearPlacements(row, sorted.clear);
        sorted.skipped.forEach((b) => skipped.add(`${t}|${tg}|${b}`));
      }
      headsOf(source, sg).forEach((h) => {
        const result = row
          ? place(row, h, source, target, {
              isAwayAt: (tb) => isAway(t, tg, tb),
              skipAt: (tb) => skip(t, tg, tb)
            })
          : { why: LEFT_OUT.NO_GROUP };
        if (result && result.skipped !== undefined) {
          skipped.add(`${t}|${tg}|${result.skipped}`);
        } else if (result) {
          leftOut.push({
            day: t,
            group: sg,
            block: h.b,
            slot: h.slot,
            ...result
          });
        }
      });
    });
  });
  return { runs: rows.runs(), leftOut, skipped: skipped.size };
}

/** A group's placements on a day, fixed and recurring aside: { b, slot, length } each. */
function headsOf(day, g) {
  const row = slots(day, g);
  const heads = [];
  row.forEach((slot, b) => {
    if (slot && !slot.startsWith(CARRIES_ON) && !isSetTime(slot)) {
      heads.push({ b, slot, length: placementIn(row, b).length });
    }
  });
  return heads;
}

/** The target's blocks for a source placement, by Id and next to each other; or the one missing. */
function blocksOn(head, source, target) {
  const at = [];
  for (let i = 0; i < head.length; i++) {
    const blockId = source.blocks[head.b + i].id;
    const tb = target.blocks.findIndex((x) => x.id === blockId);
    if (tb < 0 || (i > 0 && tb !== at[i - 1] + 1)) {
      return { missing: head.b + i };
    }
    at.push(tb);
  }
  return { at };
}

/**
 * Places a source placement on a target row at the same blocks. Returns null when it went in or
 * is already there, { skipped } (a block) when someone else's cell is in the way, or why not.
 */
function place(row, head, source, target, checks) {
  const { at, missing } = blocksOn(head, source, target);
  if (!at) {
    return { why: LEFT_OUT.NO_BLOCK, missing };
  }
  return placeAt(row, at, head.slot, gone(source, head.slot), checks);
}

/**
 * Puts a placement (`slot`) on a row's blocks `at` (indexes, next to each other), as place()
 * does; `isGone`: deleted from setup since it was placed.
 */
function placeAt(row, at, slot, isGone, { isAwayAt, skipAt }) {
  const wanted = at.map((tb, i) => {
    return i === 0 ? slot : CARRIES_ON + slot;
  });
  if (at.every((tb, i) => row[tb] === wanted[i])) {
    return null;
  }
  if (!isPlaceable(slot)) {
    return { why: LEFT_OUT.NOT_SET_UP };
  }
  if (isGone) {
    return { why: LEFT_OUT.GONE };
  }
  const theirs = at.find(skipAt);
  if (theirs !== undefined) {
    return { skipped: theirs };
  }
  if (at.some(isAwayAt)) {
    return { why: LEFT_OUT.AWAY };
  }
  const taken = at.find((tb) => row[tb] !== OPEN);
  if (taken !== undefined) {
    return { why: LEFT_OUT.TAKEN, blocking: owner(row[taken]) };
  }
  at.forEach((tb, i) => {
    row[tb] = wanted[i];
  });
  return null;
}

/**
 * Pastes copied cells (Edit > Paste, Ctrl/Cmd+V; Greg decision 45) as one change, by the same
 * rules as Copy day to…: what goes in is an activity still in setup, at a time its bunk is at
 * camp; fixed and recurring activities stay where setup put them; what can't go is left out
 * whole and listed. tool: { items: [{ date, groupId, blockIds, slot, gone, name }] (each
 * placement, by the blocks it goes onto, next to each other), opens: [cell keys] (copied Open
 * cells: what is there is cleared), outside: [{ slot, name }] (no room on the grid) }. Every
 * placement Undo could put back that a pasted cell touches is cleared whole first. Returns {
 * runs, leftOut: [{ day, group, block, slot, name, why, blocking }], skipped } (day and group
 * indexes, null for no room).
 */
export function pasteEdit(days, tool, options = {}) {
  const { isAway = never, skip = never } = options;
  const rows = new Rows(days);
  const noRoom = (o) => ({
    day: null,
    group: null,
    block: null,
    slot: o.slot,
    name: o.name,
    why: LEFT_OUT.NO_ROOM
  });
  const leftOut = (tool.outside || []).map(noRoom);
  const skipped = new Set();
  // Where cells go on this week: { d, g, at } (block indexes next to each other), or null.
  const onto = (date, groupId, blockIds) => {
    const d = days.findIndex((x) => x.dateValue === date);
    const day = days[d];
    if (!day || day.problem) {
      return null;
    }
    const g = day.groups.findIndex((x) => x.id === groupId);
    const at = blockIds.map((id) => day.blocks.findIndex((x) => x.id === id));
    const apart = at.some((b, i) => b < 0 || (i > 0 && b !== at[i - 1] + 1));
    return g < 0 || apart ? null : { d, g, at };
  };
  // Each bunk's day the paste reaches: the blocks it covers and the placements going onto it.
  const targets = new Map();
  const targetOf = ({ d, g }) => {
    const key = `${d}|${g}`;
    if (!targets.has(key)) {
      targets.set(key, { d, g, covered: new Set(), placements: [] });
    }
    return targets.get(key);
  };
  (tool.items || []).forEach((item) => {
    const where = onto(item.date, item.groupId, item.blockIds);
    if (!where) {
      leftOut.push(noRoom(item));
      return;
    }
    const target = targetOf(where);
    where.at.forEach((b) => target.covered.add(b));
    target.placements.push({ item, at: where.at });
  });
  (tool.opens || []).forEach((key) => {
    const [date, groupId, blockId] = key.split("|");
    const where = onto(date, groupId, [blockId]);
    if (where) {
      targetOf(where).covered.add(where.at[0]);
    }
  });
  targets.forEach(({ d, g, covered, placements }) => {
    const row = rows.get(d, g);
    const isAwayAt = (b) => isAway(d, g, b);
    const skipAt = (b) => skip(d, g, b);
    const touches = (first, length) =>
      [...Array(length).keys()].some((i) => covered.has(first + i));
    const sorted = sortRow(days[d], row, isAwayAt, skipAt);
    sorted.skipped
      .filter((b) => touches(b, placementIn(row, b).length))
      .forEach((b) => skipped.add(`${d}|${g}|${b}`));
    clearPlacements(
      row,
      sorted.clear.filter((p) => touches(p.first, p.length))
    );
    placements.forEach(({ item, at }) => {
      const result = placeAt(row, at, item.slot, !!item.gone, {
        isAwayAt,
        skipAt
      });
      if (result && result.skipped !== undefined) {
        skipped.add(`${d}|${g}|${result.skipped}`);
      } else if (result) {
        leftOut.push({
          day: d,
          group: g,
          block: at[0],
          slot: item.slot,
          name: item.name,
          ...result
        });
      }
    });
  });
  return { runs: rows.runs(), leftOut, skipped: skipped.size };
}

// ---------- a tool, by day dates and Ids, and worked out again after someone else's change ----------

/** A cell's key, by day date, group Id and time block Id ("2026-06-29|g1|t2"). */
export function cellKey(day, g, b) {
  return `${day.dateValue}|${day.groups[g].id}|${day.blocks[b].id}`;
}

/** What a cell (by key) holds in a week, or null when the week doesn't have it. */
export function slotAt(week, key) {
  const [date, groupId, blockId] = key.split("|");
  const day = week.find((d) => d.dateValue === date);
  if (!day || day.problem) {
    return null;
  }
  const g = day.groups.findIndex((x) => x.id === groupId);
  const b = day.blocks.findIndex((x) => x.id === blockId);
  return g < 0 || b < 0 ? null : slots(day, g)[b];
}

/**
 * The placement a cell (by key) is part of, as text: its first block's Id, its length and what it
 * is ("t1|3|A:a1"), so a placement made shorter or longer reads as changed in every cell it
 * covered or covers; null when the week doesn't have the cell.
 */
export function placementAt(week, key) {
  const [date, groupId, blockId] = key.split("|");
  const day = week.find((d) => d.dateValue === date);
  if (!day || day.problem) {
    return null;
  }
  const g = day.groups.findIndex((x) => x.id === groupId);
  const b = day.blocks.findIndex((x) => x.id === blockId);
  if (g < 0 || b < 0) {
    return null;
  }
  const p = placementIn(slots(day, g), b);
  return `${day.blocks[p.first].id}|${p.length}|${p.slot}`;
}

/** Every cell's key in a week. */
function keysOf(week) {
  const keys = [];
  week.forEach((day) => {
    if (day.problem) {
      return;
    }
    day.groups.forEach((grp, g) =>
      day.blocks.forEach((block, b) => keys.push(cellKey(day, g, b)))
    );
  });
  return keys;
}

/** What runs (on a week) make each cell they touch hold: key -> slot. */
export function resultOf(week, runs) {
  const made = new Map();
  runs.forEach((run) => {
    run.after.forEach((slot, i) => {
      made.set(cellKey(week[run.day], run.group, run.first + i), slot);
    });
  });
  return made;
}

/**
 * A rainy day's runs on a week (rain.js planRain): each cell that switches gets its rain plan,
 * and `marks` are the day's "Rain plan full" cells ("group Id|time block Id|activity Id"). tool:
 * { kind: "rain", dates: [date], model, locks } (locks: the cells locked when it was chosen).
 */
function rainEdit(week, tool, isAway, skip) {
  const d = week.findIndex((day) => day.dateValue === tool.dates[0]);
  const day = week[d];
  const none = { switches: [], full: [], noPlan: [], spans: [], locked: [] };
  if (!day || day.problem) {
    return { runs: [], rain: none, marks: [], week };
  }
  const locks = tool.locks || new Set();
  const plan = planRain(day, tool.model, {
    skip: (g, b) => skip(d, g, b),
    isAway: (g, b) => isAway(d, g, b),
    isLocked: (g, b) => locks.has(cellKey(day, g, b))
  });
  const rows = new Rows(week);
  plan.switches.forEach((s) => {
    rows.get(d, s.g)[s.b] = `A:${s.to}`;
  });
  const marks = plan.full.map((f) =>
    markOf(day.groups[f.g].id, day.blocks[f.b].id, f.activityId)
  );
  return { runs: rows.runs(), rain: plan, marks, week };
}

/**
 * A tool's runs on a week. tool: { kind: "clear", dates, groupId }, { kind: "copy", from,
 * dates } (days by date), { kind: "paste", dates, items, opens, outside } (pasteEdit) or
 * { kind: "rain", dates: [date], model, locks } (rainEdit). Options: isAway(week, day, group, block); skip(key) for a cell to leave
 * as it is; source, the day to copy from (by default the week's own). Returns the tool's result
 * (runs, stayed or leftOut, skipped; a rainy day's plan and marks) and `week`, the week its indexes are on.
 */
export function toolRuns(tool, week, options = {}) {
  const { isAway, skip = never, source } = options;
  const indexOf = (date) => week.findIndex((d) => d.dateValue === date);
  const dayIndexes = tool.dates.map(indexOf).filter((i) => i >= 0);
  const away = (d, g, b) => (isAway ? isAway(week, d, g, b) : false);
  const skipAt = (d, g, b) => skip(cellKey(week[d], g, b));
  if (tool.kind === "clear") {
    return {
      ...clearEdit(week, dayIndexes, {
        groupId: tool.groupId,
        isAway: away,
        skip: skipAt
      }),
      week
    };
  }
  if (tool.kind === "paste") {
    return { ...pasteEdit(week, tool, { isAway: away, skip: skipAt }), week };
  }
  if (tool.kind === "rain") {
    return rainEdit(week, tool, away, skipAt);
  }
  const from = indexOf(tool.from);
  if (from < 0) {
    return { runs: [], leftOut: [], skipped: 0, week };
  }
  const onto = source ? week.map((d, i) => (i === from ? source : d)) : week;
  return {
    ...copyDayEdit(onto, from, dayIndexes, { isAway: away, skip: skipAt }),
    week: onto
  };
}

/**
 * The placements on a tool's target days, each as its cells' keys and what it is: every
 * placement there now (in `saved`) and, for a copy, every placement copied from `source`, listed
 * first on each day; for a paste, every placement pasted, listed first of all.
 */
function placementGroups(tool, source, saved) {
  const groups =
    tool.kind === "paste"
      ? (tool.items || []).map((item) => ({
          slot: item.slot,
          keys: item.blockIds.map(
            (blockId) => `${item.date}|${item.groupId}|${blockId}`
          )
        }))
      : [];
  tool.dates.forEach((date) => {
    const target = saved.find((d) => d.dateValue === date);
    if (!target || target.problem) {
      return;
    }
    if (source) {
      source.groups.forEach((grp, g) => {
        headsOf(source, g).forEach((h) => {
          groups.push({
            slot: h.slot,
            keys: [...Array(h.length).keys()].map(
              (i) => `${date}|${grp.id}|${source.blocks[h.b + i].id}`
            )
          });
        });
      });
    }
    target.groups.forEach((grp, g) => {
      headsOf(target, g).forEach((h) => {
        groups.push({
          slot: h.slot,
          keys: [...Array(h.length).keys()].map((i) =>
            cellKey(target, g, h.b + i)
          )
        });
      });
    });
  });
  return groups;
}

/**
 * The cells with every placement (of `groups`) any of them is in added whole, and so on until
 * nothing more is.
 */
function wholeOf(groups, cells) {
  const all = new Set(cells);
  const partlyIn = (group) =>
    group.keys.some((key) => all.has(key)) &&
    !group.keys.every((key) => all.has(key));
  for (
    let found = groups.find(partlyIn);
    found;
    found = groups.find(partlyIn)
  ) {
    found.keys.forEach((key) => all.add(key));
  }
  return all;
}

/**
 * A tool worked out again on the saved week after someone else's change (ADR 0008 §24): it never
 * touches a cell that holds something else than in the week the director saw (`seen`, the week
 * the tool was made on, never anything newer), nor a cell kept in an earlier round (`kept`). A
 * copy comes from the source day as the director saw it, and a target whose source cell someone
 * else changed is kept as well. A copy (and a paste) goes placement by placement, whole or not at all: when any
 * cell of a copied placement (on the target day) or of what is there now is kept, all of its
 * cells are, so nothing is cleared for a copy that can't come. The director's own edits still
 * waiting to save aren't in `saved` (the server's week), so they never count as anyone else's.
 *
 * `locked`: cells someone locked since the director looked, which are left out too. Returns the
 * tool's result on `saved` (runs, words), `kept` (every cell kept in any round, for the next),
 * `lockedCells` (the placements left out only because a cell of theirs is locked, once each:
 * { key, slot }: its first cell and, for a copy, the activity that was to be copied there, else
 * what it holds now), `missed`: the other cells the tool meant to change that, once these
 * runs are made, won't hold what it meant, and `missedPlacements`: how many placements those
 * cells are part of (what the line counts, in the camp's word for activities).
 */
export function replan(tool, seen, saved, kept, isAway, locked = new Set()) {
  const intended = resultOf(seen, toolRuns(tool, seen, { isAway }).runs);
  // The cells kept for anyone else's change, the locks aside.
  const others = new Set(kept);
  // A cell is someone else's when the placement it is part of isn't the one the director saw
  // (not only its text: a placement made shorter keeps its first cell's text).
  const changed = (key) => placementAt(saved, key) !== placementAt(seen, key);
  keysOf(saved).forEach((key) => {
    if (changed(key)) {
      others.add(key);
    }
  });
  let source;
  if (tool.kind === "copy") {
    source = seen.find((d) => d.dateValue === tool.from);
    const sourceNow = saved.find((d) => d.dateValue === tool.from);
    if (source && sourceNow) {
      source.groups.forEach((grp, g) =>
        source.blocks.forEach((block, b) => {
          const key = cellKey(source, g, b);
          if (changed(key)) {
            tool.dates.forEach((date) =>
              others.add(`${date}|${grp.id}|${block.id}`)
            );
          }
        })
      );
    }
  }
  const groups = placementGroups(tool, source, saved);
  const withLocks = wholeOf(groups, [...others, ...locked]);
  // A copy or a paste goes placement by placement, whole or not at all.
  const whole = (tool.kind === "copy" && !!source) || tool.kind === "paste";
  const all = whole ? withLocks : new Set([...others, ...locked]);
  const result = toolRuns(tool, saved, {
    isAway,
    skip: (key) => all.has(key),
    source
  });
  // What the cells will hold once these runs are made, against what the tool meant them to.
  const made = resultOf(result.week, result.runs);
  const notMade = [...intended.keys()].filter((key) => {
    const after = made.has(key) ? made.get(key) : slotAt(saved, key);
    return after !== intended.get(key);
  });
  // A cell left out because it is locked is said as locked, whatever else changed there, and so
  // is every cell left out only because it is part of a placement with a locked cell.
  const othersWhole = wholeOf(groups, others);
  const forLock = notMade.filter(
    (key) => locked.has(key) || (withLocks.has(key) && !othersWhole.has(key))
  );
  const lockedCells = placementsOf(forLock, groups).map(({ key, group }) => ({
    key: group ? group.keys[0] : key,
    slot: group ? group.slot : slotAt(saved, key) || intended.get(key)
  }));
  const forLockSet = new Set(forLock);
  const missedKeys = notMade.filter((key) => !forLockSet.has(key));
  return {
    ...result,
    // Only the cells kept for someone else's change: a cell kept only because a lock took its
    // placement out whole is worked out again from the locks in the next round, so it is said
    // as locked there too, not as changed.
    kept: whole ? othersWhole : others,
    missed: missedKeys.length,
    missedPlacements: placementsOf(missedKeys, groups).length,
    lockedCells
  };
}

/**
 * The placements some cells are part of, once each, in the order first met: { key, group }, the
 * cell first met and its placement (of `groups`; for a copy the one being copied there comes
 * first), or no group for a cell outside every placement (counted on its own).
 */
function placementsOf(keys, groups) {
  const named = new Set();
  const found = [];
  keys.forEach((key) => {
    if (named.has(key)) {
      return;
    }
    const group = groups.find((x) => x.keys.includes(key));
    (group ? group.keys : [key]).forEach((k) => named.add(k));
    found.push({ key, group });
  });
  return found;
}
