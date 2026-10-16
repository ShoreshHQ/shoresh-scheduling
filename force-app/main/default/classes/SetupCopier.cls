/**
 * The part of "copy last season" that copies location types, locations, activities (with their
 * rain plans), and who can do each. New records link to their originals by CopiedFrom__c; the
 * original season is only read.
 */
public with sharing class SetupCopier {
  private final Id sourceSeasonId;
  private final Id newSeasonId;

  public SetupCopier(Id sourceSeasonId, Id newSeasonId) {
    this.sourceSeasonId = sourceSeasonId;
    this.newSeasonId = newSeasonId;
  }

  /**
   * Copies everything and returns original Id => copy Id for the locations and activities.
   * structureCopies maps each original division and group to its copy.
   */
  public Map<Id, Id> copy(Map<Id, Id> structureCopies) {
    Map<Id, Location__c> locationCopies = copyLocations(copyLocationTypes());
    Map<Id, Activity__c> activityCopies = copyActivities(locationCopies);
    copyEligibility(activityCopies, structureCopies);
    Map<Id, Id> result = new Map<Id, Id>();
    for (Id sourceId : locationCopies.keySet()) {
      result.put(sourceId, locationCopies.get(sourceId).Id);
    }
    for (Id sourceId : activityCopies.keySet()) {
      result.put(sourceId, activityCopies.get(sourceId).Id);
    }
    return result;
  }

  private Map<Id, LocationType__c> copyLocationTypes() {
    Map<Id, LocationType__c> copies = new Map<Id, LocationType__c>();
    for (LocationType__c type : [
      SELECT Id, Name, SortOrder__c
      FROM LocationType__c
      WHERE Season__c = :sourceSeasonId
      WITH USER_MODE
    ]) {
      LocationType__c copy = type.clone(false, true, false, false);
      copy.Season__c = newSeasonId;
      copy.CopiedFrom__c = type.Id;
      copies.put(type.Id, copy);
    }
    Database.insert(copies.values(), AccessLevel.USER_MODE);
    return copies;
  }

  private Map<Id, Location__c> copyLocations(
    Map<Id, LocationType__c> typeCopies
  ) {
    Map<Id, Location__c> copies = new Map<Id, Location__c>();
    for (Location__c location : [
      SELECT Id, Name, GroupsThatFit__c, LocationType__c, Notes__c, SortOrder__c
      FROM Location__c
      WHERE Season__c = :sourceSeasonId
      WITH USER_MODE
    ]) {
      Location__c copy = location.clone(false, true, false, false);
      copy.Season__c = newSeasonId;
      copy.LocationType__c = location.LocationType__c == null
        ? null
        : typeCopies.get(location.LocationType__c).Id;
      copy.CopiedFrom__c = location.Id;
      copies.put(location.Id, copy);
    }
    Database.insert(copies.values(), AccessLevel.USER_MODE);
    return copies;
  }

  /** Rain plans point at other activities, so they are set once every copy exists. */
  private Map<Id, Activity__c> copyActivities(
    Map<Id, Location__c> locationCopies
  ) {
    Map<Id, Activity__c> copies = new Map<Id, Activity__c>();
    Map<Id, Id> rainPlanBySource = new Map<Id, Id>();
    for (Activity__c activity : [
      SELECT
        Id,
        Name,
        Location__c,
        Length__c,
        TimesPerWeekMin__c,
        TimesPerWeekMax__c,
        NoWeeklyMax__c,
        Priority__c,
        Outdoor__c,
        RainPlan__c,
        GroupsAtOnce__c,
        NoGroupLimit__c,
        SameDivisionOnly__c,
        EarlyWeekCount__c,
        EarlyWeekByDay__c,
        EventOnly__c,
        Notes__c,
        SortOrder__c
      FROM Activity__c
      WHERE Season__c = :sourceSeasonId
      WITH USER_MODE
    ]) {
      Activity__c copy = activity.clone(false, true, false, false);
      copy.Season__c = newSeasonId;
      copy.Location__c = activity.Location__c == null
        ? null
        : locationCopies.get(activity.Location__c).Id;
      copy.RainPlan__c = null;
      copy.CopiedFrom__c = activity.Id;
      copies.put(activity.Id, copy);
      if (activity.RainPlan__c != null) {
        rainPlanBySource.put(activity.Id, activity.RainPlan__c);
      }
    }
    Database.insert(copies.values(), AccessLevel.USER_MODE);
    List<Activity__c> withRainPlans = new List<Activity__c>();
    for (Id sourceId : rainPlanBySource.keySet()) {
      withRainPlans.add(
        new Activity__c(
          Id = copies.get(sourceId).Id,
          RainPlan__c = copies.get(rainPlanBySource.get(sourceId)).Id
        )
      );
    }
    Database.update(withRainPlans, AccessLevel.USER_MODE);
    return copies;
  }

  private void copyEligibility(
    Map<Id, Activity__c> activityCopies,
    Map<Id, Id> structureCopies
  ) {
    List<ActivityEligibility__c> copies = new List<ActivityEligibility__c>();
    for (ActivityEligibility__c row : [
      SELECT Activity__c, Division__c, Group__c
      FROM ActivityEligibility__c
      WHERE Activity__c IN :activityCopies.keySet()
      WITH USER_MODE
    ]) {
      copies.add(
        new ActivityEligibility__c(
          Activity__c = activityCopies.get(row.Activity__c).Id,
          Division__c = structureCopies.get(row.Division__c),
          Group__c = structureCopies.get(row.Group__c)
        )
      );
    }
    Database.insert(copies, AccessLevel.USER_MODE);
  }
}
