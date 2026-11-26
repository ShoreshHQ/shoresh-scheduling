/**
 * The part of "copy last season" that copies location types, locations, activities (with their
 * rain plans), who can do each, when each can't run (its time blocks matched as the season
 * copy matched them), the staff and who leads each activity. New records link to their originals by CopiedFrom__c; the
 * original season is only read.
 */
public with sharing class SetupCopier {
  private final Id sourceSeasonId;
  private final Id newSeasonId;
  // The copy's import log (SeasonCopier).
  private final ImportWriter log;
  // Each copied activity's unticked boxes, read with it: Copy season stays under its query bound.
  private final List<ActivityOffTime__c> offTimes = new List<ActivityOffTime__c>();
  // And who leads each (ADR 0031 piece B), with the source season's staff.
  private final List<ActivityLeader__c> leaders = new List<ActivityLeader__c>();
  private final List<StaffMember__c> staff;
  // The source season's location types and locations, read with it (SeasonCopier).
  private final List<LocationType__c> locationTypes;
  private final List<Location__c> locations;

  public SetupCopier(SeasonCopier.Copying made) {
    this.sourceSeasonId = made.sourceSeasonId;
    this.newSeasonId = made.newSeasonId;
    this.log = made.log;
    this.staff = made.staff;
    this.locationTypes = made.locationTypes;
    this.locations = made.locations;
  }

  /**
   * Copies everything and returns original Id => copy Id for the locations and activities.
   * structureCopies maps each original division and group to its copy.
   */
  public Map<Id, Id> copy(Map<Id, Id> structureCopies) {
    Map<Id, Location__c> locationCopies = copyLocations(copyLocationTypes());
    Map<Id, Activity__c> activityCopies = copyActivities(locationCopies);
    copyEligibility(activityCopies, structureCopies);
    copyOffTimes(activityCopies, structureCopies);
    copyLeaders(activityCopies, copyStaff());
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
    for (LocationType__c type : locationTypes) {
      LocationType__c copy = type.clone(false, true, false, false);
      copy.Season__c = newSeasonId;
      copy.CopiedFrom__c = type.Id;
      copies.put(type.Id, copy);
    }
    log.saveTracked('LocationType', copies.values());
    return copies;
  }

  private Map<Id, Location__c> copyLocations(
    Map<Id, LocationType__c> typeCopies
  ) {
    Map<Id, Location__c> copies = new Map<Id, Location__c>();
    for (Location__c location : locations) {
      Location__c copy = location.clone(false, true, false, false);
      copy.Season__c = newSeasonId;
      copy.LocationType__c = location.LocationType__c == null
        ? null
        : typeCopies.get(location.LocationType__c).Id;
      copy.CopiedFrom__c = location.Id;
      copies.put(location.Id, copy);
    }
    log.saveTracked('Location', copies.values());
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
        Notes__c,
        SortOrder__c,
        FormerNames__c,
        (
          SELECT Activity__c, TimeBlock__c, Day__c
          FROM OffTimes__r
          WHERE TimeBlock__c != NULL
        ),
        (
          SELECT Activity__c, StaffMember__c
          FROM Leaders__r
          WHERE StaffMember__c != NULL
        )
      FROM Activity__c
      WHERE Season__c = :sourceSeasonId
      WITH USER_MODE
    ]) {
      for (ActivityOffTime__c row : activity.OffTimes__r) {
        offTimes.add(row);
      }
      for (ActivityLeader__c row : activity.Leaders__r) {
        leaders.add(row);
      }
      Activity__c copy = fieldsOf(activity);
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
    log.saveTracked('Activity', copies.values());
    List<Activity__c> withRainPlans = new List<Activity__c>();
    for (Id sourceId : rainPlanBySource.keySet()) {
      withRainPlans.add(
        new Activity__c(
          Id = copies.get(sourceId).Id,
          RainPlan__c = copies.get(rainPlanBySource.get(sourceId)).Id
        )
      );
    }
    // The copy keeps each rain plan as the season had it, even one made outdoors since
    // (SeasonCopier copies as a SetupWrite COPY).
    log.amend(withRainPlans);
    return copies;
  }

  /** A copy of the activity's fields, without the boxes read with it (a clone would keep them). */
  private static Activity__c fieldsOf(Activity__c activity) {
    Activity__c copy = new Activity__c();
    Map<String, Object> fields = activity.getPopulatedFieldsAsMap();
    for (String name : fields.keySet()) {
      if (name != 'Id' && !(fields.get(name) instanceof List<SObject>)) {
        copy.put(name, fields.get(name));
      }
    }
    return copy;
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
    log.saveTracked('ActivityEligibility', copies);
  }

  /** Each box unticked under When it runs, on the copied time block (ADR 0031 A7). */
  private void copyOffTimes(
    Map<Id, Activity__c> activityCopies,
    Map<Id, Id> structureCopies
  ) {
    List<ActivityOffTime__c> copies = new List<ActivityOffTime__c>();
    for (ActivityOffTime__c row : offTimes) {
      Id block = structureCopies.get(row.TimeBlock__c);
      if (block != null) {
        copies.add(
          new ActivityOffTime__c(
            Activity__c = activityCopies.get(row.Activity__c).Id,
            TimeBlock__c = block,
            Day__c = row.Day__c
          )
        );
      }
    }
    log.saveTracked('ActivityOffTime', copies);
  }

  /**
   * The season's staff (ADR 0031 piece B), with the camp system's ID, so that system finds the
   * same person in the copy (the match is per season).
   */
  private Map<Id, StaffMember__c> copyStaff() {
    Map<Id, StaffMember__c> copies = new Map<Id, StaffMember__c>();
    for (StaffMember__c person : staff) {
      copies.put(
        person.Id,
        new StaffMember__c(
          Name = person.Name,
          Notes__c = person.Notes__c,
          SortOrder__c = person.SortOrder__c,
          SourceSystem__c = person.SourceSystem__c,
          OutsideId__c = person.OutsideId__c,
          Season__c = newSeasonId,
          CopiedFrom__c = person.Id
        )
      );
    }
    log.saveTracked('StaffMember', copies.values());
    return copies;
  }

  /** Who leads each copied activity, on the copied staff. */
  private void copyLeaders(
    Map<Id, Activity__c> activityCopies,
    Map<Id, StaffMember__c> staffCopies
  ) {
    List<ActivityLeader__c> copies = new List<ActivityLeader__c>();
    for (ActivityLeader__c row : leaders) {
      StaffMember__c person = staffCopies.get(row.StaffMember__c);
      if (person != null) {
        copies.add(
          new ActivityLeader__c(
            Activity__c = activityCopies.get(row.Activity__c).Id,
            StaffMember__c = person.Id
          )
        );
      }
    }
    log.saveTracked('ActivityLeader', copies);
  }
}
