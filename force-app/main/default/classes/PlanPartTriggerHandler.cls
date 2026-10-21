/**
 * Plan parts (ADR 0014): fills the hidden key (special day or event + part number) so Salesforce
 * refuses a plan with two of the same part, and keeps a plan in its special day's or event's
 * own season.
 */
public with sharing class PlanPartTriggerHandler {
  public static void beforeSave(List<PlanPart__c> parts) {
    Set<Id> ownerIds = new Set<Id>();
    Set<Id> seasonIds = new Set<Id>();
    for (PlanPart__c part : parts) {
      part.Key__c = keyOf(part);
      ownerIds.add(ownerOf(part));
      seasonIds.add(part.Season__c);
    }
    ownerIds.remove(null);
    Map<Id, Id> seasonByOwner = new Map<Id, Id>();
    for (SpecialDay__c day : [
      SELECT Id, Season__c
      FROM SpecialDay__c
      WHERE Id IN :ownerIds
      WITH SYSTEM_MODE
    ]) {
      seasonByOwner.put(day.Id, day.Season__c);
    }
    for (SpecialEvent__c event : [
      SELECT Id, Season__c
      FROM SpecialEvent__c
      WHERE Id IN :ownerIds
      WITH SYSTEM_MODE
    ]) {
      seasonByOwner.put(event.Id, event.Season__c);
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      seasonIds
    );
    for (PlanPart__c part : parts) {
      Id ownerSeason = seasonByOwner.get(ownerOf(part));
      if (ownerSeason != null && ownerSeason != part.Season__c) {
        CampLabels labels = labelsBySeason.get(part.Season__c);
        part.addError(
          'This plan belongs to a different ' +
            labels.singularInSentence('Season') +
            ' than its ' +
            labels.singularInSentence(
              part.SpecialEvent__c != null ? 'SpecialEvent' : 'SpecialDay'
            ) +
            '.'
        );
      }
    }
  }

  private static Id ownerOf(PlanPart__c part) {
    return part.SpecialDay__c != null
      ? part.SpecialDay__c
      : part.SpecialEvent__c;
  }

  @TestVisible
  private static String keyOf(PlanPart__c part) {
    return ownerOf(part) +
      '|' +
      (part.Part__c == null ? '1' : String.valueOf(part.Part__c.intValue()));
  }
}
