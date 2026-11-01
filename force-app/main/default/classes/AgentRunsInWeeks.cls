/**
 * The weeks a setup record runs in, as Camp Setup's "Runs in" ticks have them (docs/protocol/api.md
 * API-1.53): read by week name in the table's order, and readied as the row save's week ticks.
 */
public with sharing class AgentRunsInWeeks {
  /** The season's weeks, in the table's order. */
  private static List<Week__c> seasonWeeks(Id seasonId) {
    return [
      SELECT Id, Name
      FROM Week__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY StartDate__c, SortOrder__c, Name
    ];
  }

  /** The record's week exceptions (its unticked weeks), by week. */
  private static Map<Id, Id> marksByWeek(AgentSetupRecords.Found found) {
    Map<Id, Id> result = new Map<Id, Id>();
    Id recordId = found.id;
    for (WeekException__c mark : [
      SELECT Id, Week__c
      FROM WeekException__c
      WHERE
        Group__c = :recordId
        OR Activity__c = :recordId
        OR Location__c = :recordId
        OR FixedActivity__c = :recordId
        OR RecurringActivity__c = :recordId
      WITH USER_MODE
    ]) {
      result.put(mark.Week__c, mark.Id);
    }
    return result;
  }

  /** The names of the weeks it runs in now (ticked), in the table's order. */
  public static List<String> weeksRunIn(AgentSetupRecords.Found found) {
    Map<Id, Id> off = marksByWeek(found);
    List<String> result = new List<String>();
    for (Week__c week : seasonWeeks(found.seasonId)) {
      if (!off.containsKey(week.Id)) {
        result.add(week.Name);
      }
    }
    return result;
  }

  /** The weeks named, each the season's only week called so; refused naming the weeks. */
  public static List<Id> weekIdsOf(
    Object asked,
    AgentSetupRecords.Found found
  ) {
    List<Week__c> weeks = seasonWeeks(found.seasonId);
    List<String> names = new List<String>();
    for (Week__c week : weeks) {
      names.add(week.Name);
    }
    List<Id> result = new List<Id>();
    for (String name : AgentActivityWho.namesIn(asked)) {
      if (String.isBlank(name)) {
        continue;
      }
      List<Id> called = new List<Id>();
      for (Week__c week : weeks) {
        if (IncomingBatch.fold(week.Name) == IncomingBatch.fold(name)) {
          called.add(week.Id);
        }
      }
      if (called.size() != 1) {
        throw new ShoreshException(
          called.isEmpty()
            ? 'There is no ' +
              found.labels.singularInSentence('Week') +
              ' called "' +
              name.trim().left(80) +
              '" in this season. ' +
              AgentWeeks.namesSaid(found.labels.pluralInSentence('Week'), names)
            : 'More than one is called "' +
              name.trim().left(80) +
              '", so Shoresh can\'t tell which you mean. Rename one in Shoresh, then ask again.'
        );
      }
      result.add(called[0]);
    }
    return result;
  }

  /** The table's week ticks: weeks not named unticked, weeks named ticked again. */
  public static void tick(
    List<Id> weeks,
    AgentSetupRecords.Found found,
    ScreenSaves.Extras extras
  ) {
    Set<Id> runs = new Set<Id>(weeks);
    Map<Id, Id> off = marksByWeek(found);
    extras.weeksOff = new List<RunsIn.WeekOff>();
    extras.weeksBackOn = new List<Id>();
    for (Week__c week : seasonWeeks(found.seasonId)) {
      if (runs.contains(week.Id) && off.containsKey(week.Id)) {
        extras.weeksBackOn.add(off.get(week.Id));
      } else if (!runs.contains(week.Id) && !off.containsKey(week.Id)) {
        RunsIn.WeekOff weekOff = new RunsIn.WeekOff();
        weekOff.target = found.id;
        weekOff.week = week.Id;
        extras.weeksOff.add(weekOff);
      }
    }
  }
}
