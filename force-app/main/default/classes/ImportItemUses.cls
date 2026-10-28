/**
 * What still uses an item a second import could remove (docs/import/review.md INGEST-5.8): another
 * activity's rain plan or copy, an elective's choices, weeks it is off, and any schedule of the
 * season (drafts, versions, published) with a cell of it. An item in use is never offered for
 * removal, and the save refuses one that came into use since, with the same plain reason. So
 * nothing pointing at a removed item is ever cleared.
 */
public with sharing class ImportItemUses {
  // Schedule days read for cells, at most: far more than a season holds.
  private static final Integer MAX_DAYS = 5000;

  /** Why each item is in use ("Arts & Crafts is Swim's rain plan"), for those that are. */
  public static Map<Id, String> reasons(Id seasonId, Map<Id, String> names) {
    Map<Id, String> result = new Map<Id, String>();
    if (names.isEmpty()) {
      return result;
    }
    rainPlansAndCopies(names, result);
    offerings(names, result);
    weeksOff(names, result);
    cells(seasonId, names, result);
    return result;
  }

  private static void rainPlansAndCopies(
    Map<Id, String> names,
    Map<Id, String> result
  ) {
    Set<Id> ids = names.keySet();
    for (Activity__c other : [
      SELECT Name, RainPlan__c, CopiedFrom__c
      FROM Activity__c
      WHERE RainPlan__c IN :ids OR CopiedFrom__c IN :ids
      WITH USER_MODE
    ]) {
      if (ids.contains(other.RainPlan__c)) {
        add(
          result,
          other.RainPlan__c,
          names.get(other.RainPlan__c) + ' is ' + other.Name + '\'s rain plan'
        );
      }
      if (ids.contains(other.CopiedFrom__c)) {
        add(
          result,
          other.CopiedFrom__c,
          names.get(other.CopiedFrom__c) + ' is copied into another season'
        );
      }
    }
  }

  private static void offerings(Map<Id, String> names, Map<Id, String> result) {
    Set<Id> ids = names.keySet();
    for (Offering__c offering : [
      SELECT Activity__c, ElectiveSet__r.Name
      FROM Offering__c
      WHERE Activity__c IN :ids
      WITH USER_MODE
    ]) {
      add(
        result,
        offering.Activity__c,
        names.get(offering.Activity__c) +
          ' is in ' +
          offering.ElectiveSet__r.Name +
          '\'s choices'
      );
    }
  }

  private static void weeksOff(Map<Id, String> names, Map<Id, String> result) {
    Set<Id> ids = names.keySet();
    for (WeekException__c off : [
      SELECT Activity__c, FixedActivity__c, RecurringActivity__c, Week__r.Name
      FROM WeekException__c
      WHERE
        Activity__c IN :ids
        OR FixedActivity__c IN :ids
        OR RecurringActivity__c IN :ids
      WITH USER_MODE
    ]) {
      for (
        Id item : new List<Id>{
          off.Activity__c,
          off.FixedActivity__c,
          off.RecurringActivity__c
        }
      ) {
        if (item != null && ids.contains(item)) {
          add(result, item, names.get(item) + ' is off in ' + off.Week__r.Name);
        }
      }
    }
  }

  /** A cell in any of the season's schedules: drafts, versions and published ones. */
  private static void cells(
    Id seasonId,
    Map<Id, String> names,
    Map<Id, String> result
  ) {
    for (ScheduleDay__c day : [
      SELECT Grid__c, Schedule__r.Name
      FROM ScheduleDay__c
      WHERE Schedule__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
      LIMIT :MAX_DAYS
    ]) {
      for (Id item : names.keySet()) {
        if (holds(day.Grid__c, item)) {
          add(result, item, names.get(item) + ' is on ' + day.Schedule__r.Name);
        }
      }
    }
  }

  private static Boolean holds(String grid, Id item) {
    return !String.isBlank(grid) &&
      (grid.contains(item) || grid.contains(String.valueOf(item).left(15)));
  }

  /** The first reason found is the one said. */
  private static void add(Map<Id, String> result, Id item, String reason) {
    if (!result.containsKey(item)) {
      result.put(item, reason);
    }
  }
}
