/**
 * Saving from the setup screens: only the kinds of record these screens edit, in user mode, all
 * or none, with "Runs in" week ticks saved together with their rows.
 */
public with sharing class ScreenSaves {
  // The only records these screens may save.
  private static final Set<Schema.SObjectType> SAVABLE_TYPES = new Set<Schema.SObjectType>{
    Camp__c.SObjectType,
    Season__c.SObjectType,
    Week__c.SObjectType,
    Program__c.SObjectType,
    Division__c.SObjectType,
    Group__c.SObjectType,
    TimeBlock__c.SObjectType,
    LocationType__c.SObjectType,
    Location__c.SObjectType,
    Activity__c.SObjectType
  };

  /** Creates new records and updates existing ones, with their week ticks. Returns the Ids in order. */
  public static List<Id> save(
    List<SObject> records,
    List<RunsIn.WeekOff> weeksOff,
    List<Id> weeksBackOn
  ) {
    List<SObject> rows = records == null ? new List<SObject>() : records;
    refuseWhatCannotBeSaved(rows);
    try {
      RunsIn.save(rows, weeksOff, weeksBackOn);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
    List<Id> ids = new List<Id>();
    for (SObject record : rows) {
      ids.add(record.Id);
    }
    return ids;
  }

  private static void refuseWhatCannotBeSaved(List<SObject> records) {
    for (SObject record : records) {
      if (!SAVABLE_TYPES.contains(record.getSObjectType())) {
        throw ScreenErrors.of('These screens cannot save that kind of record.');
      }
    }
    String ownRainPlan = ActivityDetails.ownRainPlanProblem(records);
    if (ownRainPlan != null) {
      throw ScreenErrors.of(ownRainPlan);
    }
  }
}
