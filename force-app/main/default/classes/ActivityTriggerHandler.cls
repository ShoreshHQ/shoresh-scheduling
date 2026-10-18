/**
 * Activities: the location and rain plan must belong to the same season as the activity, and a
 * rain plan chosen or changed must be indoors (Shoresh desktop ActivitiesScreen.jsx save()).
 */
public with sharing class ActivityTriggerHandler {
  private static final Map<Schema.SObjectField, String> TARGETS = new Map<Schema.SObjectField, String>{
    Activity__c.Location__c => 'Location',
    Activity__c.RainPlan__c => 'RainPlan'
  };

  public static void beforeSave(
    List<Activity__c> activities,
    Map<Id, Activity__c> before
  ) {
    Map<Id, Id> seasonByTarget = targetSeasons(activities);
    if (seasonByTarget.isEmpty()) {
      return;
    }
    refuseOutdoorRainPlans(activities, before);
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

  /**
   * A rain plan is used on a rainy day instead of an outdoor activity, so one that is itself
   * outdoors would do nothing. Checked only where the rain plan is chosen or changed (as the
   * desktop does), using the rain plan's outdoors as this same save leaves it.
   */
  private static void refuseOutdoorRainPlans(
    List<Activity__c> activities,
    Map<Id, Activity__c> before
  ) {
    Set<Id> chosen = new Set<Id>();
    for (Activity__c activity : activities) {
      Activity__c old = before == null ? null : before.get(activity.Id);
      if (
        activity.RainPlan__c != null &&
        (old == null || old.RainPlan__c != activity.RainPlan__c)
      ) {
        chosen.add(activity.RainPlan__c);
      }
    }
    if (chosen.isEmpty()) {
      return;
    }
    Map<Id, Boolean> outdoors = new Map<Id, Boolean>();
    for (Activity__c rainPlan : [
      SELECT Id, Outdoor__c
      FROM Activity__c
      WHERE Id IN :chosen
      WITH SYSTEM_MODE
    ]) {
      outdoors.put(rainPlan.Id, rainPlan.Outdoor__c);
    }
    for (Activity__c activity : activities) {
      if (activity.Id != null && chosen.contains(activity.Id)) {
        outdoors.put(activity.Id, activity.Outdoor__c);
      }
    }
    Map<Id, CampLabels> labelsBySeason;
    for (Activity__c activity : activities) {
      Activity__c old = before == null ? null : before.get(activity.Id);
      Boolean changed =
        old == null || old.RainPlan__c != activity.RainPlan__c;
      if (changed && outdoors.get(activity.RainPlan__c) == true) {
        if (labelsBySeason == null) {
          labelsBySeason = SetupSeasons.labelsBySeason(seasonsOf(activities));
        }
        activity.addError(
          Activity__c.RainPlan__c,
          outdoorRainPlan(labelsBySeason.get(activity.Season__c))
        );
      }
    }
  }

  /** The desktop's words, in the camp's: never an article built from a camp word. */
  public static String outdoorRainPlan(CampLabels labels) {
    return 'The ' +
      labels.singularInSentence('RainPlan') +
      ' has to be indoors. Pick an indoor one, or choose None.';
  }

  private static Set<Id> seasonsOf(List<Activity__c> activities) {
    Set<Id> result = new Set<Id>();
    for (Activity__c activity : activities) {
      result.add(activity.Season__c);
    }
    return result;
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
