/**
 * Fills an empty season with weeks from its dates, named in the camp's own words, on the days its
 * programs run (Greg, 2026-10-27: a Sunday-to-Thursday camp gets Sunday-to-Thursday weeks; a camp
 * that runs every day, 7-day weeks from its first day; no programs yet, Monday to Friday).
 */
public with sharing class SeasonWeeks {
  public static void fillFromSeasonDates(Id seasonId) {
    Database.insert(toFill(seasonId), AccessLevel.USER_MODE);
  }

  /**
   * The weeks "Fill in weeks" adds to an empty season, not yet saved: a camp workbook from
   * another season adds them in its own save (slice 4c part D) before pairing its weeks.
   */
  public static List<Week__c> toFill(Id seasonId) {
    return toFill(seasonId, null);
  }

  /** The same, on these days (an import: the days its grids run); null: the programs' days. */
  public static List<Week__c> toFill(Id seasonId, Set<String> days) {
    Season__c season = [
      SELECT
        Id,
        Camp__c,
        StartDate__c,
        EndDate__c,
        (SELECT Id FROM Weeks__r LIMIT 1),
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
    CampLabels labels = CampLabels.forCamp(season.Camp__c);
    if (!season.Weeks__r.isEmpty()) {
      throw new WeeksException(
        'This ' +
          labels.singularInSentence('Season') +
          ' already has ' +
          labels.pluralInSentence('Week') +
          '. Add more one at a time.'
      );
    }
    List<Week__c> weeks = new List<Week__c>();
    for (
      WeekCalendar.DateRange range : WeekCalendar.weeksOf(
        season.StartDate__c,
        season.EndDate__c,
        days == null || days.isEmpty() ? programDays(season.Programs__r) : days
      )
    ) {
      Integer position = weeks.size() + 1;
      weeks.add(
        new Week__c(
          Season__c = season.Id,
          Name = labels.singular('Week') + ' ' + position,
          StartDate__c = range.startDate,
          EndDate__c = range.endDate,
          SortOrder__c = position
        )
      );
    }
    if (weeks.isEmpty()) {
      throw new WeeksException(
        'The dates of this ' +
          labels.singularInSentence('Season') +
          ' have none of the days it runs, so there are no ' +
          labels.pluralInSentence('Week') +
          ' to fill in. Check its first and last days.'
      );
    }
    return weeks;
  }

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
    Set<String> days = programDays(season.Programs__r);
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
    Database.update(changed, AccessLevel.USER_MODE);
    result.said = saidOf(result.moved, season, labels);
    return result;
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
    String said =
      String.join(names, names.size() == 2 ? ' and ' : ', ') +
      ' now ' +
      (moved.size() == 1 ? 'runs' : 'run') +
      ' ' +
      WeekCalendar.weekdayName(moved[0].startDate) +
      ' to ' +
      WeekCalendar.weekdayName(moved[0].endDate) +
      '.';
    if (
      last.endDate == season.EndDate__c &&
      last.endDate.daysBetween(last.startDate) !=
      moved[0].endDate.daysBetween(moved[0].startDate)
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

  /** The days these programs run between them; Monday to Friday when none. */
  public static Set<String> programDays(List<Program__c> programs) {
    Set<String> result = new Set<String>();
    for (Program__c program : programs) {
      for (String day : SetTimePlan.WEEKDAYS) {
        if (
          (Boolean) program.get(
            SetTimePlan.dayField(Program__c.SObjectType, day)
          ) == true
        ) {
          result.add(day);
        }
      }
    }
    return result.isEmpty() ? WeekCalendar.mondayToFriday() : result;
  }

  public class WeeksException extends ShoreshException {
  }
}
