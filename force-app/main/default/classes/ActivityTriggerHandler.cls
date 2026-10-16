/** Activities: the location and rain plan must belong to the same season as the activity. */
public with sharing class ActivityTriggerHandler {
  private static final Map<Schema.SObjectField, String> TARGETS = new Map<Schema.SObjectField, String>{
    Activity__c.Location__c => 'Location',
    Activity__c.RainPlan__c => 'RainPlan'
  };

  public static void beforeSave(List<Activity__c> activities) {
    Map<Id, Id> seasonByTarget = targetSeasons(activities);
    if (seasonByTarget.isEmpty()) {
      return;
    }
    Set<Id> seasonIds = new Set<Id>();
    for (Activity__c activity : activities) {
      seasonIds.add(activity.Season__c);
    }
    Map<Id, CampLabels> labelsBySeason = SetupSeasons.labelsBySeason(seasonIds);
    for (Activity__c activity : activities) {
      for (Schema.SObjectField field : TARGETS.keySet()) {
        Id targetSeason = seasonByTarget.get((Id) activity.get(field));
        if (targetSeason != null && targetSeason != activity.Season__c) {
          activity.addError(
            field,
            SetupSeasons.otherSeason(
              labelsBySeason.get(activity.Season__c),
              TARGETS.get(field),
              'Activity'
            )
          );
        }
      }
    }
  }

  /** The season of each location and rain plan named (Ids are unique across objects). */
  private static Map<Id, Id> targetSeasons(List<Activity__c> activities) {
    Set<Id> locationIds = new Set<Id>();
    Set<Id> rainPlanIds = new Set<Id>();
    for (Activity__c activity : activities) {
      locationIds.add(activity.Location__c);
      rainPlanIds.add(activity.RainPlan__c);
    }
    locationIds.remove(null);
    rainPlanIds.remove(null);
    Map<Id, Id> result = new Map<Id, Id>();
    for (Location__c location : [
      SELECT Id, Season__c
      FROM Location__c
      WHERE Id IN :locationIds
      WITH SYSTEM_MODE
    ]) {
      result.put(location.Id, location.Season__c);
    }
    for (Activity__c rainPlan : [
      SELECT Id, Season__c
      FROM Activity__c
      WHERE Id IN :rainPlanIds
      WITH SYSTEM_MODE
    ]) {
      result.put(rainPlan.Id, rainPlan.Season__c);
    }
    return result;
  }
}
