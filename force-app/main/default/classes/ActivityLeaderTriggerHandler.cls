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
    // One read: each activity's season, with the staff named that are in it (Copy season saves
    // leaders within its query bound).
    Map<Id, Id> seasonOfActivity = new Map<Id, Id>();
    Set<Id> inSeason = new Set<Id>();
    for (Season__c season : [
      SELECT
        Id,
        (SELECT Id FROM Activities__r WHERE Id IN :activityIds),
        (SELECT Id FROM StaffMembers__r WHERE Id IN :staffIds)
      FROM Season__c
      WHERE Id IN (SELECT Season__c FROM Activity__c WHERE Id IN :activityIds)
      WITH SYSTEM_MODE
    ]) {
      for (Activity__c activity : season.Activities__r) {
        seasonOfActivity.put(activity.Id, season.Id);
      }
      for (StaffMember__c person : season.StaffMembers__r) {
        inSeason.add(season.Id + '|' + person.Id);
      }
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      new Set<Id>(seasonOfActivity.values())
    );
    for (ActivityLeader__c row : rows) {
      Id seasonId = seasonOfActivity.get(row.Activity__c);
      if (
        seasonId != null &&
        row.StaffMember__c != null &&
        !inSeason.contains(seasonId + '|' + row.StaffMember__c)
      ) {
        row.addError(
          SetupSeasons.otherSeason(
            labelsBySeason.get(seasonId),
            'StaffMember',
            'Activity'
          )
        );
      }
    }
  }
}
