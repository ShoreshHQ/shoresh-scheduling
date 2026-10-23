/**
 * A linked choice's periods and divisions as one gesture changes them (electives slice E8; repo
 * ADR 0018 choice 40; LinkedChoiceSaves): what is ticked is added once, what is unticked is
 * removed, and nothing else is touched. In user mode.
 */
public with sharing class LinkedChoiceRows {
  /** Periods ticked are added once; periods unticked are removed. */
  public static void savePeriods(
    LinkedChoice__c choice,
    LinkedChoiceSaves.Edit edit
  ) {
    Map<String, List<LinkedChoiceTime__c>> had = new Map<String, List<LinkedChoiceTime__c>>();
    for (LinkedChoiceTime__c row : choice.Times__r) {
      String key = keyOf(row.Weekday__c, row.TimeBlock__c);
      if (!had.containsKey(key)) {
        had.put(key, new List<LinkedChoiceTime__c>());
      }
      had.get(key).add(row);
    }
    List<LinkedChoiceTime__c> removes = new List<LinkedChoiceTime__c>();
    for (LinkedChoiceSaves.Period each : periodsOf(edit.periodsOff)) {
      List<LinkedChoiceTime__c> rows = had.remove(
        keyOf(each.weekday, each.blockId)
      );
      if (rows != null) {
        removes.addAll(rows);
      }
    }
    List<LinkedChoiceTime__c> adds = new List<LinkedChoiceTime__c>();
    for (LinkedChoiceSaves.Period each : periodsOf(edit.periodsOn)) {
      String key = keyOf(each.weekday, each.blockId);
      if (!had.containsKey(key)) {
        had.put(key, new List<LinkedChoiceTime__c>());
        adds.add(
          new LinkedChoiceTime__c(
            LinkedChoice__c = choice.Id,
            Weekday__c = each.weekday,
            TimeBlock__c = each.blockId
          )
        );
      }
    }
    Database.delete(removes, true, AccessLevel.USER_MODE);
    Database.insert(adds, true, AccessLevel.USER_MODE);
  }

  /** Divisions ticked are added once; divisions unticked are removed. */
  public static void saveDivisions(
    LinkedChoice__c choice,
    LinkedChoiceSaves.Edit edit
  ) {
    Map<Id, List<Coverage__c>> had = new Map<Id, List<Coverage__c>>();
    for (Coverage__c row : choice.Coverages__r) {
      if (!had.containsKey(row.Division__c)) {
        had.put(row.Division__c, new List<Coverage__c>());
      }
      had.get(row.Division__c).add(row);
    }
    List<Coverage__c> removes = new List<Coverage__c>();
    for (Id divisionId : idsOf(edit.divisionsOff)) {
      List<Coverage__c> rows = had.remove(divisionId);
      if (rows != null) {
        removes.addAll(rows);
      }
    }
    List<Coverage__c> adds = new List<Coverage__c>();
    for (Id divisionId : idsOf(edit.divisionsOn)) {
      if (divisionId != null && !had.containsKey(divisionId)) {
        had.put(divisionId, new List<Coverage__c>());
        adds.add(
          new Coverage__c(
            Season__c = choice.ElectiveSet__r.Season__c,
            LinkedChoice__c = choice.Id,
            Division__c = divisionId
          )
        );
      }
    }
    Database.delete(removes, true, AccessLevel.USER_MODE);
    Database.insert(adds, true, AccessLevel.USER_MODE);
  }

  private static String keyOf(String weekday, Id blockId) {
    return weekday + '|' + blockId;
  }

  public static List<LinkedChoiceSaves.Period> periodsOf(
    List<LinkedChoiceSaves.Period> periods
  ) {
    return periods == null ? new List<LinkedChoiceSaves.Period>() : periods;
  }

  private static List<Id> idsOf(List<Id> ids) {
    return ids == null ? new List<Id>() : ids;
  }
}
