/**
 * What a hand edit on Generated Schedule adds to Manual Build's slot saves (SlotSaves): a run is
 * made only if its cells' locks are still as the screen saw them (locksBefore), so nobody's Lock
 * is removed or covered unseen; and every cell an edit changes is locked when it holds something
 * (its whole placement), unlocked when it is left Open (Greg, 2026-10-17: hand edits are locks);
 * an Undo or Redo leaves the locks its run names instead (the screen works them out: the step's
 * own locks taken back or made again, a Lock set or removed since kept; Greg, 2026-10-18).
 */
public with sharing class GeneratedEdits {
  private SlotEdits.Run run;
  // What the run's group held before it (SlotIds.ofRow).
  private List<String> was;

  public GeneratedEdits(SlotEdits.Run run, List<String> was) {
    this.run = run;
    this.was = was;
  }

  /** Whether the run's cells are locked now exactly as the screen saw them. at: group, first block. */
  public static Boolean sawLocks(
    SlotEdits.Run run,
    ScheduleGrid grid,
    List<Integer> at
  ) {
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
   * The locks after the run (at: group, first block). An Undo or Redo names them (locksAfter),
   * and they are left exactly: the locks its step made taken back (or made again, for a Redo),
   * and a Lock the director set or removed after the step kept as they left it. Otherwise each changed cell's placement is locked when it
   * holds something and unlocked when Open, and a placement made shorter by hand is locked too,
   * so the next build keeps it as the director left it.
   */
  public void lock(ScheduleGrid grid, List<Integer> at) {
    if (run.locksAfter != null) {
      restore(grid, at);
      return;
    }
    List<String> now = SlotIds.ofRow(grid, at[0]);
    for (Integer b = at[1]; b < at[1] + run.after.size(); b++) {
      if (!now[b].equals(was[b])) {
        GeneratedLockCells.lockIfFilled(grid, new List<Integer>{ at[0], b });
      }
      if (!now[b].equals(was[b]) && SlotIds.isCarryOn(was[b])) {
        // What is left of the placement this cell carried on from (made shorter by hand).
        GeneratedLockCells.lockIfFilled(
          grid,
          new List<Integer>{ at[0], b - 1 }
        );
      }
    }
  }

  private void restore(ScheduleGrid grid, List<Integer> at) {
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

  /**
   * The draft's revision after the save, given only when the days were at the screen's revision
   * before it: otherwise someone else saved the week since the screen read it, and a whole-week
   * save built on the screen's copy must stay a conflict (the screen reads the week again).
   */
  public static String revisionAfter(
    Map<Date, ScheduleDays.DayGrid> days,
    Set<Date> changed,
    String seen
  ) {
    List<ScheduleDays.DayGrid> ordered = new List<ScheduleDays.DayGrid>();
    List<ScheduleDays.DayGrid> next = new List<ScheduleDays.DayGrid>();
    List<Date> dates = new List<Date>(days.keySet());
    dates.sort();
    for (Date day : dates) {
      ScheduleDays.DayGrid read = days.get(day);
      ordered.add(read);
      ScheduleDays.DayGrid after = new ScheduleDays.DayGrid();
      after.day = day;
      after.revision = changed.contains(day)
        ? read.revision + 1
        : read.revision;
      next.add(after);
    }
    return GeneratedDrafts.revisionOf(ordered).equals(seen ?? '')
      ? GeneratedDrafts.revisionOf(next)
      : null;
  }
}
