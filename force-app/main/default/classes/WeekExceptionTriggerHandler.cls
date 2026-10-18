/** Week exceptions: what doesn't run must belong to the same season as the week. */
public with sharing class WeekExceptionTriggerHandler {
  private static final Map<Schema.SObjectField, String> TARGETS = new Map<Schema.SObjectField, String>{
    WeekException__c.Group__c => 'Group',
    WeekException__c.Activity__c => 'Activity',
    WeekException__c.Location__c => 'Location',
    WeekException__c.FixedActivity__c => 'FixedActivity',
    WeekException__c.RecurringActivity__c => 'RecurringActivity'
  };

  /** Before save: the season check. After delete or edit: weeks ticked again (SetTimeTriggers). */
  public static void handle(
    System.TriggerOperation operation,
    List<WeekException__c> rows,
    List<WeekException__c> oldRows
  ) {
    if (operation == System.TriggerOperation.AFTER_DELETE) {
      SetTimeTriggers.weekExceptionsRemoved(oldRows);
    } else if (operation == System.TriggerOperation.AFTER_UPDATE) {
      // A row moved to another target ticks its old target back on.
      SetTimeTriggers.weekExceptionsMoved(rows);
    } else {
      beforeSave(rows);
    }
  }

  public static void beforeSave(List<WeekException__c> exceptions) {
    Set<Id> weekIds = new Set<Id>();
    for (WeekException__c row : exceptions) {
      weekIds.add(row.Week__c);
    }
    Map<Id, Week__c> weeks = new Map<Id, Week__c>(
      [
        SELECT Id, Season__c
        FROM Week__c
        WHERE Id IN :weekIds
        WITH SYSTEM_MODE
      ]
    );
    Map<Id, Id> seasonByTarget = targetSeasons(exceptions);
    Set<Id> seasonIds = new Set<Id>();
    for (Week__c week : weeks.values()) {
      seasonIds.add(week.Season__c);
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      seasonIds
    );
    for (WeekException__c row : exceptions) {
      Week__c week = weeks.get(row.Week__c);
      for (Schema.SObjectField field : TARGETS.keySet()) {
        Id targetSeason = seasonByTarget.get((Id) row.get(field));
        if (
          week != null &&
          targetSeason != null &&
          targetSeason != week.Season__c
        ) {
          row.addError(
            field,
            SetupSeasons.otherSeason(
              labelsBySeason.get(week.Season__c),
              TARGETS.get(field),
              'Week'
            )
          );
        }
      }
    }
  }

  /** The season of each group, activity, location, and fixed or recurring activity named (Ids are unique across objects). */
  private static Map<Id, Id> targetSeasons(List<WeekException__c> rows) {
    Set<Id> groupIds = new Set<Id>();
    Set<Id> otherIds = new Set<Id>();
    Set<Id> setTimeIds = new Set<Id>();
    for (WeekException__c row : rows) {
      groupIds.add(row.Group__c);
      otherIds.add(row.Activity__c);
      otherIds.add(row.Location__c);
      setTimeIds.add(row.FixedActivity__c);
      setTimeIds.add(row.RecurringActivity__c);
    }
    Map<Id, Id> result = new Map<Id, Id>();
    // Only the kinds a row names are read (a bunk's week off reads no activities or places).
    groupIds.remove(null);
    otherIds.remove(null);
    if (!groupIds.isEmpty()) {
      for (Group__c grp : [
        SELECT Id, Division__r.Program__r.Season__c
        FROM Group__c
        WHERE Id IN :groupIds
        WITH SYSTEM_MODE
      ]) {
        result.put(grp.Id, grp.Division__r.Program__r.Season__c);
      }
    }
    if (!otherIds.isEmpty()) {
      for (Activity__c activity : [
        SELECT Id, Season__c
        FROM Activity__c
        WHERE Id IN :otherIds
        WITH SYSTEM_MODE
      ]) {
        result.put(activity.Id, activity.Season__c);
      }
      for (Location__c location : [
        SELECT Id, Season__c
        FROM Location__c
        WHERE Id IN :otherIds
        WITH SYSTEM_MODE
      ]) {
        result.put(location.Id, location.Season__c);
      }
    }
    result.putAll(SetupSeasons.ofSetTimeItems(setTimeIds));
    return result;
  }
}
