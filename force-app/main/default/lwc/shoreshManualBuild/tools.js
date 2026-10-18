/**
 * Manual Build's day and week tools (Greg, Manual Build round 2, decisions 6 and 7): Clear day,
 * Clear week and Copy day to…, worked out as runs like any other edit (moves.js), so they save
 * through the same slot-by-slot checks and are one Undo step each. Only what Undo can put back
 * changes: an activity still in setup, at a time its group is at camp. Fixed and recurring
 * activities stay where setup put them; an activity deleted since, or placed where its group is
 * no longer at camp, stays (the server couldn't place it again); things not set up yet (an
 * imported elective, say) stay, and a copy lists them as left out. A position's day and group
 * are indexes into the schedule's days and that day's groups; isAway(day, group, block) says a
 * group isn't at camp in a block (indexes).
 */
import { OPEN, owner, placementIn, slots } from "./slotEdits";
import { Rows } from "./moves";

const CARRIES_ON = "^";

/** Why a copied item was left out (the page puts it into words). */
export const LEFT_OUT = Object.freeze({
  // The group isn't on the target day.
  NO_GROUP: "noGroup",
  // The target day has no such time block.
  NO_BLOCK: "noBlock",
  // Something that stays is there on the target day (its slot is `blocking`).
  TAKEN: "taken",
  // The group isn't at camp then on the target day.
  AWAY: "away",
  // Deleted from setup since it was placed.
  GONE: "gone",
  // Not set up yet (an imported elective, say): only activities can be placed.
  NOT_SET_UP: "notSetUp"
});

/** Whether an activity placed in a day's slot has been deleted from setup since. */
function gone(day, slot) {
  const id = owner(slot).slice(2);
  const item = day.items.find((i) => i.kind === "A" && i.id === id);
  return !!(item && item.gone);
}

/**
 * The placements of a group's day Undo could put back: activities still in setup, wholly at
 * times the group is at camp. { first, length, slot } each.
 */
function clearable(day, row, isAwayAt) {
  const result = [];
  row.forEach((slot, b) => {
    if (!slot.startsWith("A:") || gone(day, slot)) {
      return;
    }
    const p = placementIn(row, b);
    for (let i = 0; i < p.length; i++) {
      if (isAwayAt(b + i)) {
        return;
      }
    }
    result.push(p);
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
 * when `groupId` is given. Returns the runs, or null when there is nothing to clear.
 */
export function clearEdit(days, dayIndexes, groupId, isAway) {
  const rows = new Rows(days);
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
      clearPlacements(
        row,
        clearable(day, row, (b) => isAway(d, g, b))
      );
    });
  });
  const runs = rows.runs();
  return runs.length ? runs : null;
}

/**
 * Copies one day's activities onto other days of the week (indexes): on each target day, each
 * group's activities (those Undo could put back) are replaced by the ones it has on the source
 * day, at the same time blocks. Groups and blocks are matched by Id; a group on the target day
 * but not the source keeps its own. A source item that can't go is left out whole and listed:
 * { day, group (source index), block (source index), slot, why (LEFT_OUT), blocking (the slot in
 * the way, for TAKEN) }. Returns { runs, leftOut }.
 */
export function copyDayEdit(days, from, targets, isAway) {
  const rows = new Rows(days);
  const leftOut = [];
  const source = days[from];
  targets.forEach((t) => {
    const target = days[t];
    if (!target || target.problem || t === from) {
      return;
    }
    source.groups.forEach((grp, sg) => {
      const sourceRow = slots(source, sg);
      const heads = [];
      sourceRow.forEach((slot, b) => {
        if (slot && !slot.startsWith(CARRIES_ON) && !isSetTime(slot)) {
          heads.push({ b, slot, length: placementIn(sourceRow, b).length });
        }
      });
      const out = (h, why, blocking) =>
        leftOut.push({
          day: t,
          group: sg,
          block: h.b,
          slot: h.slot,
          why,
          ...(blocking ? { blocking } : {})
        });
      const tg = target.groups.findIndex((x) => x.id === grp.id);
      if (tg < 0) {
        heads.forEach((h) => out(h, LEFT_OUT.NO_GROUP));
        return;
      }
      const row = rows.get(t, tg);
      clearPlacements(
        row,
        clearable(target, row, (b) => isAway(t, tg, b))
      );
      heads.forEach((h) => {
        if (!h.slot.startsWith("A:")) {
          out(h, LEFT_OUT.NOT_SET_UP);
        } else if (gone(source, h.slot)) {
          out(h, LEFT_OUT.GONE);
        } else {
          const result = place(row, h, source, target, (tb) =>
            isAway(t, tg, tb)
          );
          if (result) {
            out(h, result.why, result.blocking);
          }
        }
      });
    });
  });
  return { runs: rows.runs(), leftOut };
}

function isSetTime(slot) {
  return slot.startsWith("F:") || slot.startsWith("R:");
}

/** Places a source placement on a target row at the same blocks; returns why not, or null. */
function place(row, head, source, target, isAwayAt) {
  const at = [];
  for (let i = 0; i < head.length; i++) {
    const blockId = source.blocks[head.b + i].id;
    const tb = target.blocks.findIndex((x) => x.id === blockId);
    if (tb < 0 || (i > 0 && tb !== at[i - 1] + 1)) {
      return { why: LEFT_OUT.NO_BLOCK };
    }
    at.push(tb);
  }
  if (at.some((tb) => isAwayAt(tb))) {
    return { why: LEFT_OUT.AWAY };
  }
  const taken = at.find((tb) => row[tb] !== OPEN);
  if (taken !== undefined) {
    return { why: LEFT_OUT.TAKEN, blocking: owner(row[taken]) };
  }
  at.forEach((tb, i) => {
    row[tb] = i === 0 ? head.slot : CARRIES_ON + head.slot;
  });
  return null;
}
