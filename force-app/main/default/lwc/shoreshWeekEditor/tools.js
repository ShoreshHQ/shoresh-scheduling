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
  NOT_SET_UP: "notSetUp"
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
    if (!slot.startsWith("A:")) {
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
function place(row, head, source, target, { isAwayAt, skipAt }) {
  const { at, missing } = blocksOn(head, source, target);
  if (!at) {
    return { why: LEFT_OUT.NO_BLOCK, missing };
  }
  const wanted = at.map((tb, i) => {
    return i === 0 ? head.slot : CARRIES_ON + head.slot;
  });
  if (at.every((tb, i) => row[tb] === wanted[i])) {
    return null;
  }
  if (!head.slot.startsWith("A:")) {
    return { why: LEFT_OUT.NOT_SET_UP };
  }
  if (gone(source, head.slot)) {
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
 * A tool's runs on a week. tool: { kind: "clear", dates, groupId } or { kind: "copy", from,
 * dates } (days by date). Options: isAway(week, day, group, block); skip(key) for a cell to leave
 * as it is; source, the day to copy from (by default the week's own). Returns the tool's result
 * (runs, stayed or leftOut, skipped) and `week`, the week its indexes are on.
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
 * first on each day.
 */
function placementGroups(tool, source, saved) {
  const groups = [];
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
 * else changed is kept as well. A copy goes placement by placement, whole or not at all: when any
 * cell of a copied placement (on the target day) or of what is there now is kept, all of its
 * cells are, so nothing is cleared for a copy that can't come. The director's own edits still
 * waiting to save aren't in `saved` (the server's week), so they never count as anyone else's.
 *
 * `locked`: cells someone locked since the director looked, which are left out too. Returns the
 * tool's result on `saved` (runs, words), `kept` (every cell kept in any round, for the next),
 * `lockedCells` (the placements left out only because a cell of theirs is locked, once each:
 * { key, slot }: its first cell and, for a copy, the activity that was to be copied there, else
 * what it holds now) and `missed`: the other cells the tool meant to change that, once these
 * runs are made, won't hold what it meant.
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
  const all =
    tool.kind === "copy" && source
      ? withLocks
      : new Set([...others, ...locked]);
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
  const named = new Set();
  const lockedCells = [];
  forLock.forEach((key) => {
    if (named.has(key)) {
      return;
    }
    // For a copy, the placement it was copying there comes first.
    const group = groups.find((x) => x.keys.includes(key));
    const keys = group ? group.keys : [key];
    keys.forEach((k) => named.add(k));
    lockedCells.push({
      key: keys[0],
      slot: group ? group.slot : slotAt(saved, key) || intended.get(key)
    });
  });
  return {
    ...result,
    kept: all,
    missed: notMade.length - forLock.length,
    lockedCells
  };
}
