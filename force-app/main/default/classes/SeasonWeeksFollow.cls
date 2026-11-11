/**
 * The season's weeks following the days its programs run, when a program's days change (repo
 * ADR 0028; WEEK-2.7), and Undo of that. Weeks are laid out as Fill in weeks lays them
 * (SeasonWeeks.programDays, WeekCalendar). In user mode.
 */
public with sharing class SeasonWeeksFollow {
  /** A week whose dates followed the programs' days (followProgramDays): now, and before. */
  public class Moved {
    @AuraEnabled
    public Id weekId;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Date startDate;
    @AuraEnabled
    public Date endDate;
    @AuraEnabled
    public Date wasStart;
    @AuraEnabled
    public Date wasEnd;
  }

  public class Followed {
    @AuraEnabled
    public List<Moved> moved = new List<Moved>();
    // What changed, or why nothing did, in a sentence; null when nothing needed to.
    @AuraEnabled
    public String said;
  }

  /**
   * A program's days changed (Saturday added): the season's weeks follow the days its programs
   * run, as Fill in weeks lays them out, each keeping its name (repo ADR 0028; WEEK-2.7). Only
   * when the season still has as many weeks on those days, so no week is made or dropped by
   * itself; a week stops at the season's last day, and is said to. What a week holds is kept: its
   * next build uses its new days.
   */
  public static Followed followProgramDays(Id seasonId) {
    Season__c season = [
      SELECT
        Id,
        Camp__c,
        StartDate__c,
        EndDate__c,
        (
          SELECT Id, Name, StartDate__c, EndDate__c
          FROM Weeks__r
          ORDER BY StartDate__c, SortOrder__c, Id
        ),
        (
          SELECT
            Monday__c,
            Tuesday__c,
            Wednesday__c,
            Thursday__c,
            Friday__c,
            Saturday__c,
            Sunday__c
          FROM Programs__r
        )
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ];
    Followed result = new Followed();
    List<Week__c> weeks = season.Weeks__r;
    if (weeks.isEmpty()) {
      return result;
    }
    Set<String> days = SeasonWeeks.programDays(season.Programs__r);
    List<WeekCalendar.DateRange> ranges = WeekCalendar.weeksOf(
      season.StartDate__c,
      season.EndDate__c,
      days
    );
    CampLabels labels = CampLabels.forCamp(season.Camp__c);
    if (ranges.size() != weeks.size()) {
      result.said =
        'The ' +
        labels.pluralInSentence('Week') +
        ' were left as they are: on these days the ' +
        labels.singularInSentence('Season') +
        ' would have ' +
        ranges.size() +
        ', not ' +
        weeks.size() +
        '. Change them on ' +
        labels.plural('Week') +
        '.';
      return result;
    }
    List<Week__c> changed = new List<Week__c>();
    for (Integer i = 0; i < weeks.size(); i++) {
      Week__c week = weeks[i];
      WeekCalendar.DateRange range = ranges[i];
      if (
        week.StartDate__c == range.startDate &&
        week.EndDate__c == range.endDate
      ) {
        continue;
      }
      Moved moved = new Moved();
      moved.weekId = week.Id;
      moved.name = week.Name;
      moved.wasStart = week.StartDate__c;
      moved.wasEnd = week.EndDate__c;
      moved.startDate = range.startDate;
      moved.endDate = range.endDate;
      result.moved.add(moved);
      changed.add(
        new Week__c(
          Id = week.Id,
          StartDate__c = range.startDate,
          EndDate__c = range.endDate
        )
      );
    }
    if (changed.isEmpty()) {
      return result;
    }
    // A week that would lose a day its schedules hold stays as it is: those days would no longer
    // be in it, and its schedule could no longer be published or restored.
    String held = dayHeld(result.moved);
    if (held != null) {
      result.moved = new List<Moved>();
      result.said =
        'The ' +
        labels.pluralInSentence('Week') +
        ' were left as they are: ' +
        held +
        ' has a schedule on a day it would no longer have. Change them on ' +
        labels.plural('Week') +
        '.';
      return result;
    }
    Database.update(changed, AccessLevel.USER_MODE);
    result.said = saidOf(result.moved, season, labels);
    return result;
  }

  /** The first week moved whose schedules hold a day outside its new dates, by name; or null. */
  private static String dayHeld(List<Moved> moved) {
    Map<Id, Moved> byWeek = new Map<Id, Moved>();
    for (Moved week : moved) {
      byWeek.put(week.weekId, week);
    }
    for (ScheduleDay__c day : [
      SELECT Date__c, Schedule__r.Week__c
      FROM ScheduleDay__c
      WHERE Schedule__r.Week__c IN :byWeek.keySet()
      WITH USER_MODE
      ORDER BY Date__c
    ]) {
      Moved week = byWeek.get(day.Schedule__r.Week__c);
      if (day.Date__c < week.startDate || day.Date__c > week.endDate) {
        return week.name;
      }
    }
    return null;
  }

  /** Undo of followProgramDays: each week back on the dates it had. */
  public static void putBack(List<Moved> moved) {
    List<Week__c> back = new List<Week__c>();
    for (Moved week : moved) {
      back.add(
        new Week__c(
          Id = week.weekId,
          StartDate__c = week.wasStart,
          EndDate__c = week.wasEnd
        )
      );
    }
    Database.update(back, AccessLevel.USER_MODE);
  }

  /** "Week 1 and Week 2 now run to Saturday." and, when one stops early, why. */
  private static String saidOf(
    List<Moved> moved,
    Season__c season,
    CampLabels labels
  ) {
    List<String> names = new List<String>();
    for (Moved week : moved) {
      names.add(week.name);
    }
    Moved last = moved[moved.size() - 1];
    // The days of a whole week: the longest one moved (a first or last week may be short).
    Moved whole = moved[0];
    for (Moved week : moved) {
      if (
        week.startDate.daysBetween(week.endDate) >
        whole.startDate.daysBetween(whole.endDate)
      ) {
        whole = week;
      }
    }
    String said =
      String.join(names, names.size() == 2 ? ' and ' : ', ') +
      ' now ' +
      (moved.size() == 1 ? 'runs' : 'run') +
      ' ' +
      WeekCalendar.weekdayName(whole.startDate) +
      ' to ' +
      WeekCalendar.weekdayName(whole.endDate) +
      '.';
    if (
      last.endDate == season.EndDate__c &&
      last.startDate.daysBetween(last.endDate) <
      whole.startDate.daysBetween(whole.endDate)
    ) {
      said +=
        ' ' +
        last.name +
        ' stops at the ' +
        labels.singularInSentence('Season') +
        '\'s last day.';
    }
    return said;
  }
}
