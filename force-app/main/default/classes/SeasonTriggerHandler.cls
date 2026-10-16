/**
 * Deleting a season. Refuses a season with published history. Otherwise clears the rows inside
 * the season that point at the season's own records through restrict-delete lookups, which
 * would otherwise block the whole delete (platform check (a)). Salesforce checks those lookups
 * after before-delete triggers run, so clearing them here lets the season go.
 */
public with sharing class SeasonTriggerHandler {
  public static void beforeDelete(Map<Id, Season__c> oldSeasons) {
    Map<Id, Id> campIdBySeasonId = new Map<Id, Id>();
    for (Season__c season : oldSeasons.values()) {
      campIdBySeasonId.put(season.Id, season.Camp__c);
    }
    PublishedHistory.refuseDeletes(
      oldSeasons.values(),
      'Season',
      campIdBySeasonId
    );

    Set<Id> deletable = new Set<Id>();
    for (Season__c season : oldSeasons.values()) {
      if (!season.hasErrors()) {
        deletable.add(season.Id);
      }
    }
    if (deletable.isEmpty()) {
      return;
    }
    // System mode on purpose: these rows go with the season anyway (master-detail), and a
    // scheduler allowed to delete the season must not be stopped by a row they cannot see.
    List<WeekException__c> exceptions = [
      SELECT Id
      FROM WeekException__c
      WHERE Week__r.Season__c IN :deletable
      WITH SYSTEM_MODE
    ];
    if (!exceptions.isEmpty()) {
      Database.delete(exceptions, true, AccessLevel.SYSTEM_MODE);
    }
  }
}
