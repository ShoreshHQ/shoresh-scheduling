/**
 * Manual Build's day and week tools (Greg, Manual Build round 2, decisions 6 and 7): Clear day,
 * Clear week and Copy day to…, worked out as runs like any other edit (moves.js), so they save
 * through the same slot-by-slot checks and are one Undo step each. Only activities change: fixed
 * and recurring activities stay where setup put them, a cell where a group isn't at camp is left
 * alone, and things not set up yet (an imported elective, say) stay, since only activities can be
 * placed back. A position's day and group are indexes into the schedule's days and that day's
 * groups.
 */
import { OPEN, placementIn, slots } from "./slotEdits";
import { Rows } from "./moves";

const CARRIES_ON = "^";

/** Why a copied activity was left out (the page puts it into words). */
export const LEFT_OUT = Object.freeze({
  // The group isn't on the target day.
  NO_GROUP: "noGroup",
  // The target day has no such time block.
  NO_BLOCK: "noBlock",
  // A fixed or recurring activity (or something not set up yet) is there on the target day.
  TAKEN: "taken",
  // The group isn't at camp then on the target day.
  AWAY: "away"
});

const isActivity = (slot) =>
  slot.startsWith("A:") || slot.startsWith(`${CARRIES_ON}A:`);

/** Every activity in a row made Open. */
function clearRow(row) {
  for (let b = 0; b < row.length; b++) {
    if (isActivity(row[b])) {
      row[b] = OPEN;
    }
  }
}

/**
 * Clears the activities of the given days (indexes), for every group, or for one group (its Id)
 * when `groupId` is given. Returns the runs, or null when there is nothing to clear.
 */
export function clearEdit(days, dayIndexes, groupId) {
  const rows = new Rows(days);
  dayIndexes.forEach((d) => {
    const day = days[d];
    if (!day || day.problem) {
      return;
    }
    day.groups.forEach((grp, g) => {
      if (!groupId || grp.id === groupId) {
        clearRow(rows.get(d, g));
      }
    });
  });
  const runs = rows.runs();
  return runs.length ? runs : null;
}

/**
 * Copies one day's activities onto other days of the week (indexes): on each target day, each
 * group's activities are replaced by the ones it has on the source day, at the same time blocks.
 * Fixed and recurring activities on the target stay; a copied activity that would land on one, or
 * where the group isn't at camp (isAway(day, group, block), indexes on the target day), or on a
 * time block the target day doesn't have, or for a group not on the target day, is left out
 * whole and listed: { day, group (source index), block (source index), slot, why (LEFT_OUT) }.
 * Groups and blocks are matched by Id. Returns { runs, leftOut }.
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
      const tg = target.groups.findIndex((x) => x.id === grp.id);
      const heads = [];
      sourceRow.forEach((slot, b) => {
        if (slot.startsWith("A:")) {
          heads.push({ b, slot, length: placementIn(sourceRow, b).length });
        }
      });
      if (tg < 0) {
        heads.forEach((h) =>
          leftOut.push({
            day: t,
            group: sg,
            block: h.b,
            slot: h.slot,
            why: LEFT_OUT.NO_GROUP
          })
        );
        return;
      }
      const row = rows.get(t, tg);
      clearRow(row);
      heads.forEach((h) => {
        const why = place(row, h, source, target, (tb) => isAway(t, tg, tb));
        if (why) {
          leftOut.push({ day: t, group: sg, block: h.b, slot: h.slot, why });
        }
      });
    });
  });
  return { runs: rows.runs(), leftOut };
}

/** Places a source placement on a target row at the same blocks; returns why not, or null. */
function place(row, head, source, target, isAway) {
  const at = [];
  for (let i = 0; i < head.length; i++) {
    const blockId = source.blocks[head.b + i].id;
    const tb = target.blocks.findIndex((x) => x.id === blockId);
    if (tb < 0 || (i > 0 && tb !== at[i - 1] + 1)) {
      return LEFT_OUT.NO_BLOCK;
    }
    at.push(tb);
  }
  if (at.some((tb) => isAway(tb))) {
    return LEFT_OUT.AWAY;
  }
  if (at.some((tb) => row[tb] !== OPEN)) {
    return LEFT_OUT.TAKEN;
  }
  at.forEach((tb, i) => {
    row[tb] = i === 0 ? head.slot : CARRIES_ON + head.slot;
  });
  return null;
}
