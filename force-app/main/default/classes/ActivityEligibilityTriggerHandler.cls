/** Who can do an activity: the division or group must belong to the activity's season. */
public with sharing class ActivityEligibilityTriggerHandler {
  public static void beforeSave(List<ActivityEligibility__c> rows) {
    Set<Id> activityIds = new Set<Id>();
    for (ActivityEligibility__c row : rows) {
      activityIds.add(row.Activity__c);
    }
    Map<Id, Activity__c> activities = new Map<Id, Activity__c>(
      [
        SELECT Id, Season__c
        FROM Activity__c
        WHERE Id IN :activityIds
        WITH SYSTEM_MODE
      ]
    );
    Map<Id, Id> seasonByTarget = targetSeasons(rows);
    Set<Id> seasonIds = new Set<Id>();
    for (Activity__c activity : activities.values()) {
      seasonIds.add(activity.Season__c);
    }
    Map<Id, CampLabels> labelsBySeason = SetupSeasons.labelsBySeason(seasonIds);
    for (ActivityEligibility__c row : rows) {
      Activity__c activity = activities.get(row.Activity__c);
      Id target = row.Division__c != null ? row.Division__c : row.Group__c;
      Id targetSeason = seasonByTarget.get(target);
      if (
        activity != null &&
        targetSeason != null &&
        targetSeason != activity.Season__c
      ) {
        row.addError(
          SetupSeasons.otherSeason(
            labelsBySeason.get(activity.Season__c),
            row.Division__c != null ? 'Division' : 'Group',
            'Activity'
          )
        );
      }
    }
  }

  /** The season each named division or group belongs to. */
  private static Map<Id, Id> targetSeasons(List<ActivityEligibility__c> rows) {
    Set<Id> divisionIds = new Set<Id>();
    Set<Id> groupIds = new Set<Id>();
    for (ActivityEligibility__c row : rows) {
      divisionIds.add(row.Division__c);
      groupIds.add(row.Group__c);
    }
    Map<Id, Id> result = new Map<Id, Id>();
    for (Division__c division : [
      SELECT Id, Program__r.Season__c
      FROM Division__c
      WHERE Id IN :divisionIds
      WITH SYSTEM_MODE
    ]) {
      result.put(division.Id, division.Program__r.Season__c);
    }
    for (Group__c grp : [
      SELECT Id, Division__r.Program__r.Season__c
      FROM Group__c
      WHERE Id IN :groupIds
      WITH SYSTEM_MODE
    ]) {
      result.put(grp.Id, grp.Division__r.Program__r.Season__c);
    }
    return result;
  }
}
