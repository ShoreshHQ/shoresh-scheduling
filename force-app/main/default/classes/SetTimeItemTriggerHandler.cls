/**
 * Fixed and recurring activities: the time block must be one of the program's own, and the
 * location must belong to the same season.
 */
public with sharing class SetTimeItemTriggerHandler {
  public static void beforeSave(List<SObject> items, String term) {
    Set<Id> programIds = new Set<Id>();
    Set<Id> blockIds = new Set<Id>();
    Set<Id> locationIds = new Set<Id>();
    for (SObject item : items) {
      programIds.add((Id) item.get('Program__c'));
      blockIds.add((Id) item.get('TimeBlock__c'));
      locationIds.add((Id) item.get('Location__c'));
    }
    // Ids are unique across objects: one map of what each block and location belongs to.
    Map<Id, Id> ownerOf = new Map<Id, Id>();
    for (TimeBlock__c block : [
      SELECT Id, Program__c
      FROM TimeBlock__c
      WHERE Id IN :blockIds
      WITH SYSTEM_MODE
    ]) {
      ownerOf.put(block.Id, block.Program__c);
    }
    for (Location__c location : [
      SELECT Id, Season__c
      FROM Location__c
      WHERE Id IN :locationIds
      WITH SYSTEM_MODE
    ]) {
      ownerOf.put(location.Id, location.Season__c);
    }
    Map<Id, Program__c> programs = new Map<Id, Program__c>(
      [
        SELECT Id, Season__c
        FROM Program__c
        WHERE Id IN :programIds
        WITH SYSTEM_MODE
      ]
    );
    Set<Id> seasonIds = new Set<Id>();
    for (Program__c program : programs.values()) {
      seasonIds.add(program.Season__c);
    }
    SetTimeItemTriggerHandler handler = new SetTimeItemTriggerHandler();
    handler.ownerOf = ownerOf;
    handler.labelsBySeason = SetupSeasons.labelsBySeason(seasonIds);
    handler.term = term;
    for (SObject item : items) {
      handler.check(item, programs.get((Id) item.get('Program__c')));
    }
  }

  private Map<Id, Id> ownerOf;
  private Map<Id, CampLabels> labelsBySeason;
  private String term;

  private void check(SObject item, Program__c program) {
    if (program == null) {
      return;
    }
    CampLabels labels = labelsBySeason.get(program.Season__c);
    Id blockProgram = ownerOf.get((Id) item.get('TimeBlock__c'));
    if (blockProgram != null && blockProgram != program.Id) {
      item.addError(
        'TimeBlock__c',
        'This ' +
          labels.singularInSentence('TimeBlock') +
          ' belongs to a different ' +
          labels.singularInSentence('Program') +
          ' than the ' +
          labels.singularInSentence(term) +
          '.'
      );
    }
    Id locationSeason = ownerOf.get((Id) item.get('Location__c'));
    if (locationSeason != null && locationSeason != program.Season__c) {
      item.addError(
        'Location__c',
        SetupSeasons.otherSeason(labels, 'Location', term)
      );
    }
  }
}
