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
  // Where cells in imports' own versions are collected during one reasons() call, or null.
  private static Map<Id, List<VersionUse>> collecting;

  /** Why each item is in use ("Arts & Crafts is Swim's rain plan"), for those that are. */
  public static Map<Id, String> reasons(Id seasonId, Map<Id, String> names) {
    return reasons(seasonId, names, null);
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

  /**
   * A cell in any of the season's schedules: drafts, versions and published ones. A cell only in
   * an import's own version (versionUses not null) is collected there instead, by version, for
   * the screen and the save to decide whether this import supersedes it (INGEST-5.8).
   */
  private static void cells(
    Id seasonId,
    Map<Id, String> names,
    Map<Id, String> result
  ) {
    for (ScheduleDay__c day : [
      SELECT
        Id,
        Grid__c,
        Schedule__c,
        Schedule__r.Name,
        Schedule__r.Status__c,
        Schedule__r.Origin__c,
        Schedule__r.Program__c,
        Schedule__r.Week__c
      FROM ScheduleDay__c
      WHERE Schedule__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
      LIMIT :MAX_DAYS
    ]) {
      Boolean imported =
        collecting != null && ImportedWeekGuard.isImported(day.Schedule__r);
      for (Id item : names.keySet()) {
        if (!holds(day.Grid__c, item)) {
          continue;
        }
        if (imported) {
          collect(item, day);
        } else {
          add(result, item, names.get(item) + ' is on ' + day.Schedule__r.Name);
        }
      }
    }
  }

  private static void collect(Id item, ScheduleDay__c day) {
    if (!collecting.containsKey(item)) {
      collecting.put(item, new List<VersionUse>());
    }
    collecting.get(item).add(new VersionUse(day));
  }

  /** An item's cells in one day of an import's own version. */
  public class VersionUse {
    @AuraEnabled
    public Id scheduleId { get; set; }
    @AuraEnabled
    public Id dayId { get; set; }
    @AuraEnabled
    public Id programId { get; set; }
    @AuraEnabled
    public Id weekId { get; set; }
    @AuraEnabled
    public String name { get; set; }

    public VersionUse(ScheduleDay__c day) {
      scheduleId = day.Schedule__c;
      dayId = day.Id;
      programId = day.Schedule__r.Program__c;
      weekId = day.Schedule__r.Week__c;
      name = day.Schedule__r.Name;
    }
  }

  /**
   * Why each item is in use, with an import's own versions collected apart (versionUses): the
   * screen and the save count those as uses unless this import supersedes them.
   */
  public static Map<Id, String> reasons(
    Id seasonId,
    Map<Id, String> names,
    Map<Id, List<VersionUse>> versionUses
  ) {
    Map<Id, String> result = new Map<Id, String>();
    if (names.isEmpty()) {
      return result;
    }
    rainPlansAndCopies(names, result);
    offerings(names, result);
    weeksOff(names, result);
    collecting = versionUses;
    try {
      cells(seasonId, names, result);
    } finally {
      collecting = null;
    }
    return result;
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
