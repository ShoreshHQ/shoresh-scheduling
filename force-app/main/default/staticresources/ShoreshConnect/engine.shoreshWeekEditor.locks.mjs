/**
 * Generated Schedule's locks as the week editor tracks them (ADR 0010 decision 3). A lock is a
 * cell ("date|groupId|blockId", the key the Lock menu uses). The server decides what a hand edit
 * does to locks (GeneratedEdits): every cell an edit changes is locked when it holds something
 * and unlocked when it is left Open. The editor works the same out beforehand, so the grid shows
 * the lock at once, and so each run it sends names the locks the screen saw (locksBefore) and, for
 * an Undo or Redo, the locks to leave (locksAfter): one entry per time block, "1" or "".
 * Pure: no screen.
 */

import { isSetTime, slots } from "./engine.shoreshWeekEditor.slotEdits.mjs";

export const LOCKED = "1";

// The whole group's row (its time block Ids and what each holds) after a run, kept beside the run
// (never inside it, so it is never sent): a lock covers a whole placement, and a placement can
// reach past the blocks the run changed.
const rowAfter = new WeakMap();

/**
 * Notes, for each server run (in the order they are made, on a week as it stands before the
 * first), the whole row of its group once the run is made. Runs the week doesn't have are skipped.
 */
export function noteRows(week, runs) {
  const rows = new Map();
  runs.forEach((run) => {
    const day = week.find((d) => d.dateValue === run.day);
    if (!day || day.problem || !day.rows) {
      return;
    }
    const g = day.groups.findIndex((grp) => grp.id === run.groupId);
    const first = day.blocks.findIndex((b) => b.id === run.firstBlockId);
    if (g < 0 || first < 0) {
      return;
    }
    const key = `${run.day}|${run.groupId}`;
    const next = [...(rows.get(key) || slots(day, g))];
    run.after.forEach((slot, i) => {
      if (first + i < next.length) {
        next[first + i] = slot;
      }
    });
    rows.set(key, next);
    rowAfter.set(run, { ids: day.blocks.map((b) => b.id), slots: next });
  });
}

/**
 * The locked cells of a saved week (its days' locks: one row per group, a "1" or nothing per
 * time block), or null when the week doesn't say.
 */
export function locksOfWeek(week) {
  if (!week || !week.every((day) => day.problem || Array.isArray(day.locks))) {
    return null;
  }
  const locked = new Set();
  week.forEach((day) => {
    (day.locks || []).forEach((row, g) => {
      row.split(",").forEach((mark, b) => {
        if (mark === LOCKED && day.groups[g] && day.blocks[b]) {
          locked.add(
            lockKey(day.dateValue, day.groups[g].id, day.blocks[b].id)
          );
        }
      });
    });
  });
  return locked;
}

export function lockKey(dateValue, groupId, blockId) {
  return `${dateValue}|${groupId}|${blockId}`;
}

/** A run's locks in a set of locks: one entry per time block of the run, "1" or "". */
export function marks(locks, run) {
  return run.blockIds.map((id) => {
    return locks.has(lockKey(run.day, run.groupId, id)) ? LOCKED : "";
  });
}

/** The blocks of the placement a block is part of (the server's placementOf): what it carries on from and into. */
function placementOf(row, b) {
  let first = b;
  while (first > 0 && row[first].startsWith("^")) {
    first -= 1;
  }
  const at = [first];
  for (let n = first + 1; n < row.length && row[n].startsWith("^"); n++) {
    at.push(n);
  }
  return at;
}

/**
 * The locks after a run (a new set). With `target` (an Undo or Redo), its cells take exactly the
 * locks the target holds. Otherwise, as a hand edit (GeneratedEdits.lock): the whole placement of
 * each changed cell is locked when the cell holds something and unlocked when Open (a fixed or
 * recurring activity is never locked), and what is left of a placement made shorter is locked.
 * A cell a fixed or recurring activity is cleared from by hand is locked empty.
 */
export function foldRun(locks, run, target) {
  const next = new Set(locks);
  if (target) {
    run.blockIds.forEach((id) => {
      const key = lockKey(run.day, run.groupId, id);
      if (target.has(key)) {
        next.add(key);
      } else {
        next.delete(key);
      }
    });
    return next;
  }
  const row = rowAfter.get(run) || { ids: run.blockIds, slots: run.after };
  const lockIfFilled = (b) => {
    const slot = row.slots[b];
    if (isSetTime(slot)) {
      return;
    }
    placementOf(row.slots, b).forEach((at) => {
      const key = lockKey(run.day, run.groupId, row.ids[at]);
      if (slot === "") {
        next.delete(key);
      } else {
        next.add(key);
      }
    });
  };
  run.blockIds.forEach((id, i) => {
    if (run.before[i] === run.after[i]) {
      return;
    }
    const b = row.ids.indexOf(id);
    if (run.after[i] === "" && isSetTime(run.before[i])) {
      // A fixed or recurring activity cleared or moved away by hand: locked empty, so no build
      // fills it (Greg, 2026-10-26: the director's choice beats anything generated).
      next.add(lockKey(run.day, run.groupId, id));
      return;
    }
    lockIfFilled(b);
    if (b > 0 && run.before[i].startsWith("^")) {
      // What is left of the placement this cell carried on from (made shorter).
      lockIfFilled(b - 1);
    }
  });
  return next;
}

/**
 * Runs as they are sent, each stamped with the locks the director saw when they made them
 * (locksBefore) and, for an Undo or Redo, the locks to leave (locksAfter, from `target`), each
 * run's after the ones before it are made. Never the newest locks: a lock that arrived while
 * the edit waited must come back as a refusal, not be covered.
 */
export function stampLocks(runs, seen, target) {
  let state = seen;
  return runs.map((run) => {
    const stamped = { ...run, locksBefore: marks(state, run) };
    if (target) {
      stamped.locksAfter = marks(target, run);
    }
    state = foldRun(state, run, target);
    return stamped;
  });
}
