/**
 * Whether the user can read everything SetTimePlanReader reads. That reader runs in system mode
 * because it backs the clash check (ADR 0001 §6); when a screen uses it to build something the
 * user sees (Manual Build's Start a blank week, ADR 0008), every object and field it reads must be
 * readable by the user first, so system mode shows them nothing they couldn't see in user mode.
 */
public with sharing class SetTimeAccess {
  private static final List<Schema.SObjectField> READ = new List<Schema.SObjectField>{
    FixedActivity__c.Name,
    FixedActivity__c.Program__c,
    FixedActivity__c.TimeBlock__c,
    FixedActivity__c.Length__c,
    FixedActivity__c.Location__c,
    FixedActivity__c.SortOrder__c,
    RecurringActivity__c.Name,
    RecurringActivity__c.Program__c,
    RecurringActivity__c.TimeBlock__c,
    RecurringActivity__c.Length__c,
    RecurringActivity__c.Location__c,
    RecurringActivity__c.SortOrder__c,
    RecurringActivity__c.Monday__c,
    RecurringActivity__c.Tuesday__c,
    RecurringActivity__c.Wednesday__c,
    RecurringActivity__c.Thursday__c,
    RecurringActivity__c.Friday__c,
    RecurringActivity__c.Saturday__c,
    RecurringActivity__c.Sunday__c,
    WeekException__c.Week__c,
    WeekException__c.Group__c,
    WeekException__c.Location__c,
    WeekException__c.FixedActivity__c,
    WeekException__c.RecurringActivity__c,
    Coverage__c.Division__c,
    Coverage__c.Group__c,
    Coverage__c.RecurringActivity__c,
    Season__c.Camp__c,
    Week__c.Name,
    Week__c.Season__c,
    Week__c.StartDate__c,
    Week__c.SortOrder__c,
    Location__c.Name,
    Location__c.Season__c,
    Location__c.GroupsThatFit__c,
    Program__c.Name,
    Program__c.Season__c,
    Program__c.Monday__c,
    Program__c.Tuesday__c,
    Program__c.Wednesday__c,
    Program__c.Thursday__c,
    Program__c.Friday__c,
    Program__c.Saturday__c,
    Program__c.Sunday__c,
    Program__c.SortOrder__c,
    TimeBlock__c.Name,
    TimeBlock__c.StartTime__c,
    TimeBlock__c.EndTime__c,
    TimeBlock__c.PartOfDay__c,
    TimeBlock__c.SortOrder__c,
    TimeBlock__c.Program__c,
    Group__c.Name,
    Group__c.Availability__c,
    Group__c.Division__c,
    Group__c.SortOrder__c,
    Division__c.Name,
    Division__c.SortOrder__c,
    Division__c.Program__c
  };

  /** True when every object and field the set-time plan reads is readable by the user. */
  public static Boolean canRead() {
    for (Schema.SObjectField field : READ) {
      if (!field.getDescribe().isAccessible()) {
        return false;
      }
    }
    return true;
  }
}
