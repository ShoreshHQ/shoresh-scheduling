/**
 * What Apply to other weeks leaves as it is in the target week, and says so (WEEK-6.2): a date a
 * special day replaces in either week (its grid is hidden: nothing is copied from or into it), a
 * day switched to its rain plan in either week, and a group away in either week (its row stays,
 * said once, never refused activity by activity). Each line is said once.
 */
public with sharing class WeekApplyKeep {
  private Map<Date, String> targetSpecials;
  private Map<Date, String> sourceSpecials;
  private Set<Id> targetAway;
  private Set<Id> sourceAway;
  private GeneratedSetup setup;
  private String sourceWeekName;
  public List<String> lines = new List<String>();

  /** source: the draft being applied (Week__c, Week__r.Name); setup: the target week's. */
  public WeekApplyKeep(GeneratedSetup setup, Schedule__c source) {
    this.setup = setup;
    sourceWeekName = source.Week__r.Name;
    targetSpecials = specialsOf(setup.week);
    sourceSpecials = specialsOf(
      ProgramReads.weekWithSpecialDays(source.Week__c, setup.program)
    );
    targetAway = setup.away();
    sourceAway = new Set<Id>();
    for (WeekException__c mark : [
      SELECT Group__c
      FROM WeekException__c
      WHERE Week__c = :source.Week__c AND Group__c != NULL
      WITH USER_MODE
    ]) {
      sourceAway.add(mark.Group__c);
    }
  }

  /** The special day on each date a special day replaces (none when they can't be read). */
  private static Map<Date, String> specialsOf(Week__c week) {
    Map<Date, String> result = new Map<Date, String>();
    if (WeekSpecials.replacedDates(week) == null) {
      return result;
    }
    for (SpecialDate__c row : week.SpecialDates__r) {
      Date onDate = SpecialDates.dateOf(
        week.StartDate__c,
        week.EndDate__c,
        row.Day__c
      );
      if (onDate != null) {
        result.put(onDate, row.SpecialDay__r.Name);
      }
    }
    return result;
  }

  /** Whether the target day stays as it is beside the source day (said, once, if so). */
  public Boolean dayStays(
    ScheduleDays.DayGrid target,
    ScheduleDays.DayGrid source,
    String dayName
  ) {
    String special = targetSpecials.get(target.day) ??
      sourceSpecials.get(source.day);
    if (special != null) {
      say(dayName + ': ' + special + ' stays');
      return true;
    }
    if (!target.rain.isEmpty() || !source.rain.isEmpty()) {
      say(dayName + ': rainy day, stays as it is');
      return true;
    }
    return false;
  }

  /** The groups away in either week: their rows stay, each said once. */
  public Set<Id> awayGroups() {
    Set<Id> away = new Set<Id>();
    for (Group__c grp : setup.groups) {
      if (targetAway.contains(grp.Id)) {
        say(grp.Name + ': away this ' + weekWord() + ', stays as it is');
        away.add(grp.Id);
      } else if (sourceAway.contains(grp.Id)) {
        say(grp.Name + ': away in ' + sourceWeekName + ', stays as it is');
        away.add(grp.Id);
      }
    }
    return away;
  }

  /** A target group the source day has no row for: its row stays. */
  public void groupMissing(String groupName, String dayName) {
    say(
      groupName +
        ' · ' +
        dayName +
        ': not in ' +
        sourceWeekName +
        ', stays as it is'
    );
  }

  /** A target placement on a time block the source day doesn't have: it stays. */
  public void blockMissing(String placement, String blockName) {
    say(
      placement +
        ': ' +
        sourceWeekName +
        ' has no ' +
        blockName +
        ', stays as it is'
    );
  }

  private String weekWord() {
    return setup.labels().singularInSentence('Week');
  }

  private void say(String line) {
    if (!lines.contains(line)) {
      lines.add(line);
    }
  }
}
