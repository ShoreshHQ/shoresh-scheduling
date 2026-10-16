/**
 * "Runs in" weeks: each group, activity, location, fixed activity, and recurring activity row on the screens has a tick for every
 * week, all ticked by default. An unticked week is stored as a week exception, exactly as before.
 * A table's rows and its week ticks are saved together, all or none.
 */
public with sharing class RunsIn {
  // The field a week exception uses for each kind of row.
  private static final Map<Schema.SObjectType, Schema.SObjectField> TARGET_FIELD = new Map<Schema.SObjectType, Schema.SObjectField>{
    Group__c.SObjectType => WeekException__c.Group__c,
    Activity__c.SObjectType => WeekException__c.Activity__c,
    Location__c.SObjectType => WeekException__c.Location__c,
    FixedActivity__c.SObjectType => WeekException__c.FixedActivity__c,
    RecurringActivity__c.SObjectType => WeekException__c.RecurringActivity__c
  };

  /** A week unticked on one row: a saved row (target), or a new one (its place in the rows sent). */
  public class WeekOff {
    @AuraEnabled
    public Id target { get; set; }
    @AuraEnabled
    public Integer row { get; set; }
    @AuraEnabled
    public Id week { get; set; }
  }

  /**
   * Saves the rows, stores the unticked weeks (new rows included), and removes the week
   * exceptions of weeks ticked again. Nothing is saved if any of it fails.
   */
  public static void save(
    List<SObject> records,
    List<WeekOff> weeksOff,
    List<Id> weeksBackOn
  ) {
    List<SObject> rows = records == null ? new List<SObject>() : records;
    Savepoint beforeSave = Database.setSavepoint();
    try {
      UserModeWrites.save(rows);
      List<WeekException__c> adds = marks(weeksOff, rows);
      // A save without week ticks (a season, a program) needs no week exception work.
      if (!adds.isEmpty() || (weeksBackOn != null && !weeksBackOn.isEmpty())) {
        WeekExceptions.save(adds, weeksBackOn);
      }
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw e;
    }
  }

  private static List<WeekException__c> marks(
    List<WeekOff> weeksOff,
    List<SObject> rows
  ) {
    List<WeekException__c> result = new List<WeekException__c>();
    for (WeekOff off : weeksOff == null ? new List<WeekOff>() : weeksOff) {
      Id target = targetOf(off, rows);
      WeekException__c mark = new WeekException__c(Week__c = off.week);
      mark.put(TARGET_FIELD.get(target.getSObjectType()), target);
      result.add(mark);
    }
    return result;
  }

  private static Id targetOf(WeekOff off, List<SObject> rows) {
    Id target = off.target;
    if (
      target == null &&
      off.row != null &&
      off.row >= 0 &&
      off.row < rows.size()
    ) {
      target = rows[off.row].Id;
    }
    if (target == null || !TARGET_FIELD.containsKey(target.getSObjectType())) {
      throw new ShoreshException(
        'These screens cannot save that week for that kind of record.'
      );
    }
    return target;
  }
}
