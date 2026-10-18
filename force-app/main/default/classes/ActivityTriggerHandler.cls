/**
 * Activities: the location and rain plan must belong to the same season as the activity, and an
 * activity with a rain plan saves only if that rain plan is indoors (Shoresh desktop
 * ActivitiesScreen.jsx save()).
 */
public with sharing class ActivityTriggerHandler {
  /**
   * Off while a season is copied or an import undone: they put rain plans back as they were, so
   * an outdoor one already chosen is kept (and shown as one to choose again), never refused.
   */
  public static Boolean checkRainPlans = true;
  // Set by the platform on every save, so never a sign that the director edited the row.
  private static final Set<String> SYSTEM_FIELDS = new Set<String>{
    'LastModifiedDate',
    'LastModifiedById',
    'SystemModstamp'
  };

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
   * outdoors would do nothing. As on the desktop, saving an activity whose rain plan is outdoors
   * is refused, whatever else changed, using the rain plan's outdoors as this same save leaves it.
   * Making an activity outdoors that is another's rain plan is not refused (nor on the desktop);
   * that one shows "(outdoor, choose another)" until its rain plan is changed.
   */
  private static void refuseOutdoorRainPlans(
    List<Activity__c> activities,
    Map<Id, Activity__c> before
  ) {
    List<Activity__c> withRainPlan = new List<Activity__c>();
    Set<Id> chosen = new Set<Id>();
    for (Activity__c activity : activities) {
      if (
        checkRainPlans &&
        activity.RainPlan__c != null &&
        editsTheActivity(activity, before)
      ) {
        withRainPlan.add(activity);
        chosen.add(activity.RainPlan__c);
      }
    }
    if (withRainPlan.isEmpty()) {
      return;
    }
    Map<Id, Boolean> outdoors = outdoorsAfterSave(chosen, activities);
    Map<Id, CampLabels> labelsBySeason;
    for (Activity__c activity : withRainPlan) {
      if (outdoors.get(activity.RainPlan__c) == true) {
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

  /**
   * A new activity, or a change to one of its own fields. A save that changes nothing on the row
   * (a week tick, who can do it, saved with the row) is not an edit of the activity: on the
   * desktop those are records of their own, and never refused for its rain plan.
   */
  private static Boolean editsTheActivity(
    Activity__c activity,
    Map<Id, Activity__c> before
  ) {
    Activity__c old = before == null ? null : before.get(activity.Id);
    if (old == null) {
      return true;
    }
    for (String field : activity.getPopulatedFieldsAsMap().keySet()) {
      if (
        !SYSTEM_FIELDS.contains(field) && activity.get(field) != old.get(field)
      ) {
        return true;
      }
    }
    return false;
  }

  /** Whether each rain plan is outdoors as this save leaves it (its own change counts). */
  private static Map<Id, Boolean> outdoorsAfterSave(
    Set<Id> rainPlanIds,
    List<Activity__c> saving
  ) {
    Map<Id, Boolean> outdoors = new Map<Id, Boolean>();
    for (Activity__c rainPlan : [
      SELECT Id, Outdoor__c
      FROM Activity__c
      WHERE Id IN :rainPlanIds
      WITH SYSTEM_MODE
    ]) {
      outdoors.put(rainPlan.Id, rainPlan.Outdoor__c);
    }
    for (Activity__c activity : saving) {
      if (activity.Id != null && rainPlanIds.contains(activity.Id)) {
        outdoors.put(activity.Id, activity.Outdoor__c);
      }
    }
    return outdoors;
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
