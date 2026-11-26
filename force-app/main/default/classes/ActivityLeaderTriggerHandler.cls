/** Who leads an activity: the staff member must belong to the activity's season. */
public with sharing class ActivityLeaderTriggerHandler {
  public static void beforeSave(List<ActivityLeader__c> rows) {
    // A delete (no new rows) is only checked for an archived season (ArchivedSeasons).
    if (rows != null) {
      checkSeasons(rows);
    }
  }

  private static void checkSeasons(List<ActivityLeader__c> rows) {
    Set<Id> activityIds = new Set<Id>();
    Set<Id> staffIds = new Set<Id>();
    for (ActivityLeader__c row : rows) {
      activityIds.add(row.Activity__c);
      staffIds.add(row.StaffMember__c);
    }
    Map<Id, Activity__c> activities = new Map<Id, Activity__c>(
      [
        SELECT Id, Season__c
        FROM Activity__c
        WHERE Id IN :activityIds
        WITH SYSTEM_MODE
      ]
    );
    Map<Id, StaffMember__c> staff = new Map<Id, StaffMember__c>(
      [
        SELECT Id, Season__c
        FROM StaffMember__c
        WHERE Id IN :staffIds
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
    for (ActivityLeader__c row : rows) {
      Activity__c activity = activities.get(row.Activity__c);
      StaffMember__c person = staff.get(row.StaffMember__c);
      if (
        activity != null &&
        person != null &&
        person.Season__c != activity.Season__c
      ) {
        row.addError(
          SetupSeasons.otherSeason(
            labelsBySeason.get(activity.Season__c),
            'StaffMember',
            'Activity'
          )
        );
      }
    }
  }
}
