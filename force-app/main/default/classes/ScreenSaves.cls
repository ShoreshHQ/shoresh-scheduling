/**
 * Saving from the setup screens: only the kinds of record these screens edit, in user mode, all
 * or none, with "Runs in" week ticks (and, for recurring activities, who each covers) saved
 * together with their rows. Clashes between fixed and recurring activities are checked once
 * everything is written, and refuse the whole save.
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
    Activity__c.SObjectType,
    FixedActivity__c.SObjectType,
    RecurringActivity__c.SObjectType
  };

  /** What a table sends with its rows: week ticks, and who each recurring activity covers. */
  public class Extras {
    @AuraEnabled
    public List<RunsIn.WeekOff> weeksOff { get; set; }
    @AuraEnabled
    public List<Id> weeksBackOn { get; set; }
    @AuraEnabled
    public List<SetTimeWho.Who> who { get; set; }
  }

  /** Creates new records and updates existing ones, with their week ticks. Returns the Ids in order. */
  public static List<Id> save(
    List<SObject> records,
    List<RunsIn.WeekOff> weeksOff,
    List<Id> weeksBackOn
  ) {
    Extras extras = new Extras();
    extras.weeksOff = weeksOff;
    extras.weeksBackOn = weeksBackOn;
    return save(records, extras);
  }

  /** The same, with who each recurring activity covers. */
  public static List<Id> save(List<SObject> records, Extras extras) {
    List<SObject> rows = records == null ? new List<SObject>() : records;
    Extras given = extras == null ? new Extras() : extras;
    refuseWhatCannotBeSaved(rows);
    SetTimeGuard.defer();
    Savepoint beforeSave = Database.setSavepoint();
    try {
      RunsIn.save(rows, given.weeksOff, given.weeksBackOn);
      SetTimeWho.save(rows, given.who);
      SetTimeGuard.checkPending();
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw ScreenErrors.of(e);
    } finally {
      SetTimeGuard.resume();
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
