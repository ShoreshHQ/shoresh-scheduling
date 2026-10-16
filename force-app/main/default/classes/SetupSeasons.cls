/** Shared pieces for the checks that keep a season's setup inside that season. */
public with sharing class SetupSeasons {
  /** Each season's camp labels; system mode so a check never fails on access. */
  public static Map<Id, CampLabels> labelsBySeason(Set<Id> seasonIds) {
    Map<Id, Id> campBySeason = new Map<Id, Id>();
    for (Season__c season : [
      SELECT Id, Camp__c
      FROM Season__c
      WHERE Id IN :seasonIds
      WITH SYSTEM_MODE
    ]) {
      campBySeason.put(season.Id, season.Camp__c);
    }
    Map<Id, CampLabels> byCamp = CampLabels.forCamps(
      new Set<Id>(campBySeason.values())
    );
    Map<Id, CampLabels> result = new Map<Id, CampLabels>();
    for (Id seasonId : seasonIds) {
      CampLabels labels = byCamp.get(campBySeason.get(seasonId));
      result.put(
        seasonId,
        labels == null ? CampLabels.modelTermsOnly() : labels
      );
    }
    return result;
  }

  /** "This location belongs to a different season than the activity." */
  public static String otherSeason(
    CampLabels labels,
    String targetTerm,
    String ownerTerm
  ) {
    return 'This ' +
      labels.singularInSentence(targetTerm) +
      ' belongs to a different ' +
      labels.singularInSentence('Season') +
      ' than the ' +
      labels.singularInSentence(ownerTerm) +
      '.';
  }

  /** The season of each fixed and recurring activity named (through its program). */
  public static Map<Id, Id> ofSetTimeItems(Set<Id> itemIds) {
    Map<Id, Id> result = new Map<Id, Id>();
    itemIds.remove(null);
    if (itemIds.isEmpty()) {
      return result;
    }
    for (FixedActivity__c item : [
      SELECT Id, Program__r.Season__c
      FROM FixedActivity__c
      WHERE Id IN :itemIds
      WITH SYSTEM_MODE
    ]) {
      result.put(item.Id, item.Program__r.Season__c);
    }
    for (RecurringActivity__c item : [
      SELECT Id, Program__r.Season__c
      FROM RecurringActivity__c
      WHERE Id IN :itemIds
      WITH SYSTEM_MODE
    ]) {
      result.put(item.Id, item.Program__r.Season__c);
    }
    return result;
  }
}
