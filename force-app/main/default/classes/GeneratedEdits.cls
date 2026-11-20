/**
 * What a hand edit on Generated Schedule adds to Manual Build's slot saves (SlotSaves.RunLocks,
 * for GeneratedHandEdit and for Apply to other weeks on a Generated draft): a run is
 * made only if its cells' locks are still as the screen saw them (locksBefore), so nobody's Lock
 * is removed or covered unseen; and every cell an edit changes is locked when it holds something
 * (its whole placement), unlocked when it is left Open (Greg, 2026-10-17: hand edits are locks),
 * except a cell a fixed or recurring activity is cleared from, which is locked empty (Greg,
 * 2026-10-26: a set time the director cleared by hand is never filled by a build);
 * an Undo or Redo leaves the locks its run names instead (the screen works them out: the step's
 * own locks taken back or made again, a Lock set or removed since kept; Greg, 2026-10-18).
 */
public with sharing class GeneratedEdits implements SlotSaves.RunLocks {
  /** Whether the run's cells are locked now exactly as the screen saw them. */
  public Boolean asSeen(SlotSaves.RunAt made, ScheduleGrid grid) {
    SlotEdits.Run run = made.run;
    List<Integer> at = made.at;
    for (Integer i = 0; i < run.after.size(); i++) {
      Boolean saw =
        run.locksBefore != null &&
        i < run.locksBefore.size() &&
        ScheduleGridLocks.LOCKED.equals(run.locksBefore[i]);
      if (saw != ScheduleGridLocks.isLocked(grid, at[0], at[1] + i)) {
        return false;
      }
    }
    return true;
  }

  /**
   * The locks after the run. An Undo or Redo names them (locksAfter),
   * and they are left exactly: the locks its step made taken back (or made again, for a Redo),
   * and a Lock the director set or removed after the step kept as they left it. Otherwise each changed cell's placement is locked when it
   * holds something and unlocked when Open, and a placement made shorter by hand is locked too,
   * so the next build keeps it as the director left it.
   */
  public void lock(SlotSaves.RunAt made, ScheduleGrid grid) {
    if (made.run.locksAfter != null) {
      restore(made, grid);
      return;
    }
    List<Integer> at = made.at;
    List<String> now = SlotIds.ofRow(grid, at[0]);
    for (Integer b = at[1]; b < at[1] + made.run.after.size(); b++) {
      if (!now[b].equals(made.was[b])) {
        lockChanged(made.was, grid, new List<Integer>{ at[0], b });
      }
    }
  }

  /**
   * One changed cell's locks (cell: group, block), as lock() says; was: the row before the run.
   */
  private static void lockChanged(
    List<String> was,
    ScheduleGrid grid,
    List<Integer> cell
  ) {
    Integer b = cell[1];
    // Locks never change what a row holds, so the row after the run is read as it is.
    if (
      SlotIds.ofRow(grid, cell[0])[b] == SlotIds.OPEN &&
      SlotIds.isSetTime(was[b])
    ) {
      // A fixed or recurring activity cleared or moved away by hand: locked empty, so no build
      // fills it (Greg, 2026-10-26: the director's choice beats anything generated).
      ScheduleGridLocks.lock(grid, cell);
      return;
    }
    GeneratedLockCells.lockIfFilled(grid, cell);
    if (SlotIds.isCarryOn(was[b])) {
      // What is left of the placement this cell carried on from (made shorter by hand).
      GeneratedLockCells.lockIfFilled(
        grid,
        new List<Integer>{ cell[0], b - 1 }
      );
    }
  }

  private static void restore(SlotSaves.RunAt made, ScheduleGrid grid) {
    SlotEdits.Run run = made.run;
    List<Integer> at = made.at;
    if (run.locksAfter.size() != run.after.size()) {
      throw GeneratedFrames.unreadable();
    }
    List<String> now = SlotIds.ofRow(grid, at[0]);
    for (Integer i = 0; i < run.locksAfter.size(); i++) {
      List<Integer> cell = new List<Integer>{ at[0], at[1] + i };
      String lock = run.locksAfter[i] ?? '';
      if (!(lock.equals(ScheduleGridLocks.LOCKED) || lock.equals(''))) {
        throw GeneratedFrames.unreadable();
      }
      if (
        lock.equals(ScheduleGridLocks.LOCKED) &&
        !SlotIds.isSetTime(now[cell[1]])
      ) {
        ScheduleGridLocks.lock(grid, cell);
      } else {
        ScheduleGridLocks.unlock(grid, cell);
      }
    }
  }
}
