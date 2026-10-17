/**
 * After-save trigger steps that hand changes which could make fixed or recurring activities
 * clash to SetTimeGuard. Each reports only the changes that matter, by the season, program,
 * division, or week they belong to, and runs no query of its own.
 */
public with sharing class SetTimeTriggers {
  /** A fixed or recurring activity saved. */
  public static void itemsSaved(List<SObject> items) {
    Set<Id> programIds = new Set<Id>();
    for (SObject item : items) {
      programIds.add(
        (Id) item.get(SetTimePlan.fieldsOf(item.getSObjectType()).program)
      );
    }
    SetTimeGuard.itemsSaved();
    SetTimeGuard.changed(programIds, items, SetTimeMessages.Side.ITEM);
  }

  /** Who a recurring activity covers changed (removing a row can widen it to everyone). */
  public static void coverageChanged(List<Coverage__c> rows) {
    Set<Id> seasonIds = new Set<Id>();
    for (Coverage__c row : rows) {
      seasonIds.add(row.Season__c);
    }
    SetTimeGuard.changed(seasonIds, rows, SetTimeMessages.Side.ITEM);
  }

  /**
   * A week ticked again (its week exception removed): a fixed or recurring activity runs that
   * week, a bunk is back, or a location is open again.
   */
  public static void weekExceptionsRemoved(List<WeekException__c> rows) {
    Set<Id> itemWeeks = new Set<Id>();
    List<WeekException__c> onItems = new List<WeekException__c>();
    Set<Id> otherWeeks = new Set<Id>();
    List<WeekException__c> others = new List<WeekException__c>();
    for (WeekException__c row : rows) {
      if (row.FixedActivity__c != null || row.RecurringActivity__c != null) {
        itemWeeks.add(row.Week__c);
        onItems.add(row);
      } else if (row.Group__c != null || row.Location__c != null) {
        otherWeeks.add(row.Week__c);
        others.add(row);
      }
    }
    SetTimeGuard.changed(itemWeeks, onItems, SetTimeMessages.Side.ITEM);
    SetTimeGuard.changed(otherWeeks, others, SetTimeMessages.Side.OTHER);
  }

  /** A week exception edited: whatever it named before runs that week again. */
  public static void weekExceptionsMoved(List<WeekException__c> rows) {
    Set<Id> weekIds = new Set<Id>();
    for (WeekException__c row : rows) {
      weekIds.add(row.Week__c);
    }
    SetTimeGuard.changed(weekIds, rows, SetTimeMessages.Side.ITEM);
  }

  /** A program restored from the Recycle Bin, with its fixed and recurring activities. */
  public static void programsRestored(List<Program__c> programs) {
    Set<Id> seasonIds = new Set<Id>();
    for (Program__c program : programs) {
      seasonIds.add(program.Season__c);
    }
    SetTimeGuard.changed(seasonIds, programs, SetTimeMessages.Side.OTHER);
  }

  /** A new week: every fixed and recurring activity runs in it unless unticked. */
  public static void weeksAdded(List<Week__c> weeks) {
    Set<Id> seasonIds = new Set<Id>();
    for (Week__c week : weeks) {
      seasonIds.add(week.Season__c);
    }
    SetTimeGuard.changed(seasonIds, weeks, SetTimeMessages.Side.OTHER);
  }

  /** Fewer groups fitting at a location. */
  public static void locationsSaved(
    List<Location__c> locations,
    Map<Id, Location__c> before
  ) {
    Set<Id> seasonIds = new Set<Id>();
    List<Location__c> smaller = new List<Location__c>();
    for (Location__c location : locations) {
      if (
        location.GroupsThatFit__c < before.get(location.Id).GroupsThatFit__c
      ) {
        seasonIds.add(location.Season__c);
        smaller.add(location);
      }
    }
    SetTimeGuard.changed(seasonIds, smaller, SetTimeMessages.Side.LOCATION);
  }

  /** Time blocks added, changed, or deleted: the order of the day and its parts can move. */
  public static void timeBlocksChanged(List<TimeBlock__c> blocks) {
    Set<Id> programIds = new Set<Id>();
    for (TimeBlock__c block : blocks) {
      programIds.add(block.Program__c);
    }
    SetTimeGuard.changed(programIds, blocks, SetTimeMessages.Side.TIME_BLOCK);
  }

  /**
   * New groups, a group now at camp at another part of the day, or a group moved to another
   * division (who a recurring activity aimed at either division covers changes).
   */
  public static void groupsSaved(
    List<Group__c> groups,
    Map<Id, Group__c> before
  ) {
    Set<Id> divisionIds = new Set<Id>();
    List<Group__c> changed = new List<Group__c>();
    for (Group__c grp : groups) {
      Group__c old = before == null ? null : before.get(grp.Id);
      if (
        old == null ||
        grp.Availability__c != old.Availability__c ||
        grp.Division__c != old.Division__c
      ) {
        divisionIds.add(grp.Division__c);
        if (old != null) {
          divisionIds.add(old.Division__c);
        }
        changed.add(grp);
      }
    }
    SetTimeGuard.changed(divisionIds, changed, SetTimeMessages.Side.OTHER);
  }

  /** A program's days changed. */
  public static void programsSaved(
    List<Program__c> programs,
    Map<Id, Program__c> before
  ) {
    Set<Id> seasonIds = new Set<Id>();
    List<Program__c> changed = new List<Program__c>();
    for (Program__c program : programs) {
      if (daysChanged(program, before.get(program.Id))) {
        seasonIds.add(program.Season__c);
        changed.add(program);
      }
    }
    SetTimeGuard.changed(seasonIds, changed, SetTimeMessages.Side.OTHER);
  }

  private static Boolean daysChanged(Program__c now, Program__c was) {
    for (String day : SetTimePlan.WEEKDAYS) {
      Schema.SObjectField field = SetTimePlan.dayField(
        Program__c.SObjectType,
        day
      );
      if ((Boolean) now.get(field) != (Boolean) was.get(field)) {
        return true;
      }
    }
    return false;
  }
}
