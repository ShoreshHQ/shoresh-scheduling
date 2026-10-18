/**
 * What a hand edit on Generated Schedule adds to Manual Build's slot saves (SlotSaves): a run is
 * made only if its cells' locks are still as the screen saw them (locksBefore), so nobody's Lock
 * is removed or covered unseen; and every cell an edit changes is locked when it holds something
 * (its whole placement), unlocked when it is left Open (Greg, 2026-10-17: hand edits are locks).
 */
public with sharing class GeneratedEdits {
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

  /** Locks (or unlocks) each cell of the run that changed. at: group, first block, length. */
  public static void lockChanged(
    ScheduleGrid grid,
    List<String> was,
    List<Integer> at
  ) {
    List<String> now = SlotIds.ofRow(grid, at[0]);
    for (Integer b = at[1]; b < at[1] + at[2]; b++) {
      if (!now[b].equals(was[b])) {
        GeneratedLockCells.lockIfFilled(grid, new List<Integer>{ at[0], b });
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
