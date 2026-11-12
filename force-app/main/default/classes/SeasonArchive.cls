/**
 * Archive and Bring back a season (WEEK-1.9 to WEEK-1.12; ADR 0029), for Camp Setup and the
 * person's AI alike (archive_season, bring_back_season). Archiving keeps everything in the season
 * and makes it read-only (ArchivedSeasons); bringing it back makes it a season like any other.
 * User-mode DML, one record, all or none: the person needs the right to change the season.
 */
public with sharing class SeasonArchive {
  /** Archives the season: kept whole, read-only, out of the season picker. */
  @AuraEnabled
  public static void archive(Id seasonId) {
    write(new Season__c(Id = seasonId, Archived__c = true));
  }

  /** Brings an archived season back: it can be changed again and is in the picker again. */
  @AuraEnabled
  public static void bringBack(Id seasonId) {
    write(new Season__c(Id = seasonId, Archived__c = false));
  }

  private static void write(Season__c season) {
    try {
      Database.update(season, true, AccessLevel.USER_MODE);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
