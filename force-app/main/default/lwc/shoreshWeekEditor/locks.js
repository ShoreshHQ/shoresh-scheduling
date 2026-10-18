/**
 * Generated Schedule's locks as the week editor tracks them (ADR 0010 decision 3). A lock is a
 * cell ("date|groupId|blockId", the key the Lock menu uses). The server decides what a hand edit
 * does to locks (GeneratedEdits): every cell an edit changes is locked when it holds something
 * and unlocked when it is left Open. The editor works the same out beforehand, so the grid shows
 * the lock at once, and so each run it sends names the locks the screen saw (locksBefore) and, for
 * an Undo or Redo, the locks to restore (locksAfter): one entry per time block, "1" or "".
 * Pure: no screen.
 */

export const LOCKED = "1";

export function lockKey(dateValue, groupId, blockId) {
  return `${dateValue}|${groupId}|${blockId}`;
}

/** A run's locks in a set of locks: one entry per time block of the run, "1" or "". */
export function marks(locks, run) {
  return run.blockIds.map((id) => {
    return locks.has(lockKey(run.day, run.groupId, id)) ? LOCKED : "";
  });
}

/**
 * The locks after a run (a new set). With `target` (an Undo or Redo), its cells take exactly the
 * locks the target holds; otherwise, as a hand edit: a changed cell is locked when it holds
 * something and unlocked when Open, and what is left of a placement made shorter stays locked.
 */
export function foldRun(locks, run, target) {
  const next = new Set(locks);
  const set = (id, on) => {
    const key = lockKey(run.day, run.groupId, id);
    if (on) {
      next.add(key);
    } else {
      next.delete(key);
    }
  };
  run.blockIds.forEach((id, i) => {
    if (target) {
      set(id, target.has(lockKey(run.day, run.groupId, id)));
    } else if (run.before[i] !== run.after[i]) {
      set(id, run.after[i] !== "");
      if (i > 0 && run.before[i].startsWith("^") && run.after[i - 1] !== "") {
        set(run.blockIds[i - 1], true);
      }
    }
  });
  return next;
}
