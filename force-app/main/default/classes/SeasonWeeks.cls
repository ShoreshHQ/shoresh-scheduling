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
