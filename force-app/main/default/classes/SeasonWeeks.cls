/** Fills an empty season with weeks from its dates, named in the camp's own words. */
public with sharing class SeasonWeeks {
  public static void fillFromSeasonDates(Id seasonId) {
    Season__c season = [
      SELECT
        Id,
        Camp__c,
        StartDate__c,
        EndDate__c,
        (SELECT Id FROM Weeks__r LIMIT 1)
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
      WeekCalendar.DateRange range : WeekCalendar.weekdayWeeks(
        season.StartDate__c,
        season.EndDate__c
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
          ' have no weekdays, so there are no ' +
          labels.pluralInSentence('Week') +
          ' to fill in. Check its first and last days.'
      );
    }
    Database.insert(weeks, AccessLevel.USER_MODE);
  }

  public class WeeksException extends ShoreshException {
  }
}
