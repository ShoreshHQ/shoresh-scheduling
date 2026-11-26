/** When an activity can't run: the time block must belong to the activity's season. */
public with sharing class ActivityOffTimeTriggerHandler {
  public static void beforeSave(List<ActivityOffTime__c> rows) {
    // A delete (no new rows) is only checked for an archived season (ArchivedSeasons).
    if (rows != null) {
      checkSeasons(rows);
    }
  }

  private static void checkSeasons(List<ActivityOffTime__c> rows) {
    Set<Id> activityIds = new Set<Id>();
    Set<Id> blockIds = new Set<Id>();
    for (ActivityOffTime__c row : rows) {
      activityIds.add(row.Activity__c);
      blockIds.add(row.TimeBlock__c);
    }
    Map<Id, Activity__c> activities = new Map<Id, Activity__c>(
      [
        SELECT Id, Season__c
        FROM Activity__c
        WHERE Id IN :activityIds
        WITH SYSTEM_MODE
      ]
    );
    Map<Id, TimeBlock__c> blocks = new Map<Id, TimeBlock__c>(
      [
        SELECT Id, Program__r.Season__c
        FROM TimeBlock__c
        WHERE Id IN :blockIds
        WITH SYSTEM_MODE
      ]
    );
    Set<Id> seasonIds = new Set<Id>();
    for (Activity__c activity : activities.values()) {
      seasonIds.add(activity.Season__c);
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      seasonIds
    );
    for (ActivityOffTime__c row : rows) {
      Activity__c activity = activities.get(row.Activity__c);
      TimeBlock__c block = blocks.get(row.TimeBlock__c);
      if (
        activity != null &&
        block != null &&
        block.Program__r.Season__c != activity.Season__c
      ) {
        row.addError(
          SetupSeasons.otherSeason(
            labelsBySeason.get(activity.Season__c),
            'TimeBlock',
            'Activity'
          )
        );
      }
    }
  }
}
