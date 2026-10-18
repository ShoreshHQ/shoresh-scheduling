/**
 * Lock and unlock on Generated Schedule (Greg, 2026-10-17, decisions 2 and 3): one cell, or the
 * shortcuts a whole day or a whole group. A lock keeps a cell as it is when the week is built
 * again; Start over clears every lock. A lock always covers a whole placement (all the blocks of
 * a multi-block activity), as the engine keeps it. Fixed and recurring activities always stay
 * where setup puts them, so they are never locked. Runs in user mode under the draft's lock;
 * the days are written by ScheduleDaySaves, so a build made from the week before the change is
 * a conflict.
 */
public with sharing class GeneratedLocks {
  /** Applies the changes in order and returns the week as it now is. */
  public static GeneratedWeek.Locked apply(
    Id scheduleId,
    List<GeneratedWeek.LockChange> changes
  ) {
    if (changes == null || changes.isEmpty()) {
      throw GeneratedFrames.unreadable();
    }
    Schedule__c draft = GeneratedDrafts.lockedToEdit(scheduleId);
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(draft.Id);
    GeneratedFrames.checkReadable(days);
    for (GeneratedWeek.LockChange change : changes) {
      applyOne(days, change);
    }
    List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
    for (ScheduleDays.DayGrid day : days) {
      ScheduleGridLocks.tidy(day.grid);
      saves.add(new ScheduleDaySaves.DaySave(day.day, day.grid, day.revision));
    }
    ScheduleDaySaves.write(draft.Id, saves);
    GeneratedWeek.Locked result = new GeneratedWeek.Locked();
    result.schedule = ScheduleViews.open(draft.Id);
    result.revision = GeneratedDrafts.revisionOf(ScheduleDays.read(draft.Id));
    return result;
  }

  /** One change; refused when it can't be read or names no cell of the week. */
  private static void applyOne(
    List<ScheduleDays.DayGrid> days,
    GeneratedWeek.LockChange change
  ) {
    Boolean readable =
      change != null &&
      (change.action == GeneratedWeek.LOCK ||
      change.action == GeneratedWeek.UNLOCK);
    if (!readable || cellsIn(days, change) == 0) {
      throw GeneratedFrames.unreadable();
    }
  }

  /** Locks or unlocks every cell the change names; returns how many cells it named. */
  private static Integer cellsIn(
    List<ScheduleDays.DayGrid> days,
    GeneratedWeek.LockChange change
  ) {
    Integer named = 0;
    for (ScheduleDays.DayGrid day : days) {
      if (change.dateValue == null || change.dateValue == day.day) {
        named += cellsIn(day.grid, change);
      }
    }
    return named;
  }

  private static Integer cellsIn(
    ScheduleGrid grid,
    GeneratedWeek.LockChange change
  ) {
    Integer named = 0;
    for (Integer g = 0; g < grid.groups.size(); g++) {
      if (matches(grid.groups[g].id, change.groupId)) {
        named += cellsInRow(grid, g, change);
      }
    }
    return named;
  }

  private static Integer cellsInRow(
    ScheduleGrid grid,
    Integer g,
    GeneratedWeek.LockChange change
  ) {
    Integer named = 0;
    List<String> slots = SlotIds.ofRow(grid, g);
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      if (matches(grid.blocks[b].id, change.blockId)) {
        named++;
        if (!SlotIds.isSetTime(slots[b])) {
          setPlacement(grid, new List<Integer>{ g, b }, change);
        }
      }
    }
    return named;
  }

  /** Whether a record Id is the one named (any, when none is named). */
  private static Boolean matches(String recordId, String named) {
    return String.isBlank(named) ||
      SlotIds.indexOf(new List<String>{ recordId }, named) == 0;
  }

  /** The cell and the rest of its placement: the blocks it carries on from and into. */
  private static void setPlacement(
    ScheduleGrid grid,
    List<Integer> cell,
    GeneratedWeek.LockChange change
  ) {
    List<String> row = grid.rows[cell[0]];
    Integer first = cell[1];
    while (first > 0 && row[first] == ScheduleGrid.CARRIES_ON) {
      first--;
    }
    Integer last = cell[1];
    while (last + 1 < row.size() && row[last + 1] == ScheduleGrid.CARRIES_ON) {
      last++;
    }
    for (Integer b = first; b <= last; b++) {
      List<Integer> each = new List<Integer>{ cell[0], b };
      if (change.locks()) {
        ScheduleGridLocks.lock(grid, each);
      } else {
        ScheduleGridLocks.unlock(grid, each);
      }
    }
  }
}
