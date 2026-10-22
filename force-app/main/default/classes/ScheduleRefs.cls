/**
 * Which of the records a schedule's days point at (time blocks, groups, activities, fixed and
 * recurring activities, special events and days) still exist and can be seen, so the page can mark the rest as gone.
 */
public with sharing class ScheduleRefs {
  public static Set<String> stillThere(List<ScheduleDays.DayGrid> days) {
    return stillThere(days, null);
  }

  /**
   * The same, when some records are already known to be there (the Generated screen has just read
   * its program's setup): they are kept and only the rest are looked for, so both screens give one
   * answer, a record that exists is never marked deleted.
   */
  public static Set<String> stillThere(
    List<ScheduleDays.DayGrid> days,
    Set<String> known
  ) {
    Set<Id> ids = new Set<Id>();
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid != null) {
        collect(day.grid, ids);
      }
    }
    Set<String> found = known == null ? new Set<String>() : known.clone();
    ids = unknown(ids, found);
    if (ids.isEmpty()) {
      return found;
    }
    found.addAll(ScheduleRecordsThere.of(ids));
    return found;
  }

  /** The Ids not already known to be there. */
  private static Set<Id> unknown(Set<Id> ids, Set<String> known) {
    Set<Id> rest = new Set<Id>();
    for (Id id : ids) {
      if (!known.contains(String.valueOf(id))) {
        rest.add(id);
      }
    }
    return rest;
  }

  /** Whether the text is the Id of a record found still there (15 or 18 characters). */
  public static Boolean isThere(String text, Set<String> found) {
    Set<Id> one = new Set<Id>();
    add(text, one);
    return !one.isEmpty() && found.contains(new List<Id>(one)[0]);
  }

  private static void collect(ScheduleGrid grid, Set<Id> ids) {
    for (ScheduleGrid.Block block : grid.blocks) {
      add(block.id, ids);
    }
    for (ScheduleGrid.GroupRef grp : grid.groups) {
      add(grp.id, ids);
    }
    for (ScheduleGrid.Item item : grid.items) {
      add(item.id, ids);
    }
  }

  /** Adds the text as a record Id, if it is one; anything else cannot still be there. */
  private static void add(String text, Set<Id> ids) {
    if (String.isBlank(text)) {
      return;
    }
    try {
      ids.add(Id.valueOf(text));
    } catch (StringException e) {
      return;
    }
  }
}
