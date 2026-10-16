/**
 * Which of the records a schedule's days point at (time blocks, groups, activities, fixed and
 * recurring activities) still exist and can be seen, so the page can mark the rest as gone.
 */
public with sharing class ScheduleRefs {
  public static Set<String> stillThere(List<ScheduleDays.DayGrid> days) {
    Set<Id> ids = new Set<Id>();
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid != null) {
        collect(day.grid, ids);
      }
    }
    Set<String> found = new Set<String>();
    if (ids.isEmpty()) {
      return found;
    }
    for (TimeBlock__c row : [
      SELECT Id
      FROM TimeBlock__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      found.add(row.Id);
    }
    for (Group__c row : [
      SELECT Id
      FROM Group__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      found.add(row.Id);
    }
    for (Activity__c row : [
      SELECT Id
      FROM Activity__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      found.add(row.Id);
    }
    for (FixedActivity__c row : [
      SELECT Id
      FROM FixedActivity__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      found.add(row.Id);
    }
    for (RecurringActivity__c row : [
      SELECT Id
      FROM RecurringActivity__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      found.add(row.Id);
    }
    return found;
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
