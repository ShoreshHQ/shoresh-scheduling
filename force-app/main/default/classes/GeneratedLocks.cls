/**
 * Lock and unlock on Generated Schedule (Greg, 2026-10-17, decisions 2 and 3): one cell, or the
 * shortcuts a whole day or a whole group (or a group's day). A lock keeps a cell as it is when
 * the week is built again; Start over clears every lock. A lock always covers a whole placement
 * (all the blocks of a multi-block activity), as the engine keeps it. Fixed and recurring
 * activities always stay where setup puts them, so they are never locked.
 *
 * Like a whole-week save, a change names the revision the screen read the week at: if someone
 * else saved the week since, nothing is changed and the answer is a conflict, so a screen never
 * goes on building from a week that isn't the saved one. Only the days whose locks changed are
 * written. Runs in user mode under the draft's lock; the days are written by ScheduleDaySaves.
 */
public with sharing class GeneratedLocks {
  /** Applies the changes in order and returns the week as it now is, or a conflict. */
  public static GeneratedWeek.Locked apply(
    Id scheduleId,
    List<GeneratedWeek.LockChange> changes,
    String seen
  ) {
    if (changes == null || changes.isEmpty()) {
      throw GeneratedFrames.unreadable();
    }
    Schedule__c draft = GeneratedDrafts.lockedToEdit(scheduleId);
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(draft.Id);
    GeneratedWeek.Locked result = new GeneratedWeek.Locked();
    if (!GeneratedDrafts.revisionOf(days).equals(seen ?? '')) {
      result.conflict = true;
      result.message = ScheduleDaySaves.CHANGED_SINCE;
      return result;
    }
    GeneratedFrames.checkReadable(days);
    Map<Date, String> before = new Map<Date, String>();
    for (ScheduleDays.DayGrid day : days) {
      before.put(day.day, day.grid.toText());
    }
    for (GeneratedWeek.LockChange change : changes) {
      applyOne(days, change);
    }
    result.revision = write(draft.Id, days, before);
    result.schedule = ScheduleViews.open(draft.Id);
    return result;
  }

  /** Writes the days whose locks changed; returns the week's revision after it. */
  private static String write(
    Id draftId,
    List<ScheduleDays.DayGrid> days,
    Map<Date, String> before
  ) {
    List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
    List<ScheduleDays.DayGrid> after = new List<ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : days) {
      ScheduleGridLocks.tidy(day.grid);
      ScheduleDays.DayGrid next = new ScheduleDays.DayGrid();
      next.day = day.day;
      next.revision = day.revision;
      if (!day.grid.toText().equals(before.get(day.day))) {
        saves.add(
          new ScheduleDaySaves.DaySave(day.day, day.grid, day.revision)
        );
        next.revision = day.revision + 1;
      }
      after.add(next);
    }
    if (!saves.isEmpty()) {
      ScheduleDaySaves.write(draftId, saves);
    }
    return GeneratedDrafts.revisionOf(after);
  }

  /** One change; refused when it can't be read or names no cell of the week. */
  private static void applyOne(
    List<ScheduleDays.DayGrid> days,
    GeneratedWeek.LockChange change
  ) {
    if (!readable(change) || GeneratedLockCells.apply(days, change) == 0) {
      throw GeneratedFrames.unreadable();
    }
  }

  /**
   * Lock or Unlock (spelled exactly), naming one of: a cell (day, group and time block), a day,
   * a group, or a group's day.
   */
  private static Boolean readable(GeneratedWeek.LockChange change) {
    if (
      change == null ||
      !(GeneratedWeek.LOCK.equals(change.action) ||
      GeneratedWeek.UNLOCK.equals(change.action))
    ) {
      return false;
    }
    Boolean day = change.dateValue != null;
    Boolean grp = String.isNotBlank(change.groupId);
    Boolean block = String.isNotBlank(change.blockId);
    return block ? day && grp : day || grp;
  }
}
