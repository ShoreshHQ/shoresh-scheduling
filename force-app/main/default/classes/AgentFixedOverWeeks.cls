/**
 * For AgentFixedOver (API-1.147): the weeks a fixed activity being saved runs in, and whether a
 * recurring activity runs in one of them, as fixedOver.js reads them: every week of the season but
 * its week-off marks, with the weeks ticked back on or off in this save (null: the season has no
 * weeks, so they always meet).
 */
public with sharing class AgentFixedOverWeeks {
  private List<Id> weeks = new List<Id>();
  private List<WeekException__c> marks;
  private Set<Id> fixedWeeks;

  /** The season's weeks and week-off marks, and the fixed activity's weeks in this save. */
  public AgentFixedOverWeeks(
    Id seasonId,
    Id recordId,
    ScreenSaves.Extras extras
  ) {
    for (Week__c week : [
      SELECT Id
      FROM Week__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY StartDate__c, SortOrder__c, Id
    ]) {
      weeks.add(week.Id);
    }
    marks = [
      SELECT Id, Week__c, FixedActivity__c, RecurringActivity__c
      FROM WeekException__c
      WHERE Week__r.Season__c = :seasonId
      WITH USER_MODE
    ];
    fixedWeeks = weeksOf(fixedOff(recordId, extras));
  }

  /** Whether it and a recurring activity run in a week: one with no weeks runs in all. */
  public Boolean sharedWith(Id itemId) {
    Set<Id> off = new Set<Id>();
    for (WeekException__c mark : marks) {
      if (mark.RecurringActivity__c == itemId) {
        off.add(mark.Week__c);
      }
    }
    Set<Id> itemWeeks = weeksOf(off);
    if (fixedWeeks == null || itemWeeks == null) {
      return true;
    }
    for (Id week : fixedWeeks) {
      if (itemWeeks.contains(week)) {
        return true;
      }
    }
    return false;
  }

  /** The weeks a row runs in: every week but its week-off marks. Null when the season has none. */
  private Set<Id> weeksOf(Set<Id> off) {
    if (weeks.isEmpty()) {
      return null;
    }
    Set<Id> result = new Set<Id>(weeks);
    result.removeAll(off);
    return result;
  }

  /** The weeks it is off: its marks not ticked back on, and the weeks ticked off in this save. */
  private Set<Id> fixedOff(Id recordId, ScreenSaves.Extras extras) {
    Set<Id> backOn = new Set<Id>();
    if (extras != null && extras.weeksBackOn != null) {
      backOn.addAll(extras.weeksBackOn);
    }
    Set<Id> off = new Set<Id>();
    for (WeekException__c mark : marks) {
      if (
        recordId != null &&
        mark.FixedActivity__c == recordId &&
        !backOn.contains(mark.Id)
      ) {
        off.add(mark.Week__c);
      }
    }
    off.addAll(tickedOff(extras));
    return off;
  }

  private static Set<Id> tickedOff(ScreenSaves.Extras extras) {
    Set<Id> result = new Set<Id>();
    if (extras == null || extras.weeksOff == null) {
      return result;
    }
    for (RunsIn.WeekOff weekOff : extras.weeksOff) {
      result.add(weekOff.week);
    }
    return result;
  }
}
