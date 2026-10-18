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
