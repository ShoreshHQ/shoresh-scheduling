/** The camp's own words for a message about a row that could not be saved. */
public with sharing class ScreenErrorWords {
  /** The words of the camp a week belongs to; the model terms if that cannot be read. */
  public static CampLabels forWeek(Week__c week) {
    Id seasonId = week.Season__c;
    if (seasonId == null && week.Id != null) {
      List<Week__c> saved = [
        SELECT Season__c
        FROM Week__c
        WHERE Id = :week.Id
        WITH USER_MODE
      ];
      seasonId = saved.isEmpty() ? null : saved[0].Season__c;
    }
    List<Season__c> seasons = [
      SELECT Camp__c
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ];
    return seasons.isEmpty()
      ? CampLabels.modelTermsOnly()
      : CampLabels.forCamp(seasons[0].Camp__c);
  }
}
