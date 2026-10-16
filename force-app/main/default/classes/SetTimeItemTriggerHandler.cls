/**
 * Fixed and recurring activities: the time block must be one of the program's own, and the
 * location must belong to the same season.
 */
public with sharing class SetTimeItemTriggerHandler {
  // What each time block and location named belongs to: its program, or its season.
  private Map<Id, Id> ownerOf;
  private String term;

  /** Before save: the checks above. After save: the clash check (SetTimeGuard). */
  public static void handle(
    System.TriggerOperation operation,
    List<SObject> items,
    String term
  ) {
    if (
      operation == System.TriggerOperation.BEFORE_INSERT ||
      operation == System.TriggerOperation.BEFORE_UPDATE
    ) {
      beforeSave(items, term);
    } else {
      SetTimeTriggers.itemsSaved(items);
    }
  }

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
    SetTimeItemTriggerHandler handler = new SetTimeItemTriggerHandler();
    handler.ownerOf = ownerOf;
    handler.term = term;
    for (SObject item : items) {
      handler.check(item, programs.get((Id) item.get('Program__c')));
    }
  }

  private void check(SObject item, Program__c program) {
    if (program == null) {
      return;
    }
    Id blockProgram = ownerOf.get((Id) item.get('TimeBlock__c'));
    Id locationSeason = ownerOf.get((Id) item.get('Location__c'));
    Boolean otherBlock = blockProgram != null && blockProgram != program.Id;
    Boolean otherLocation =
      locationSeason != null &&
      locationSeason != program.Season__c;
    if (!otherBlock && !otherLocation) {
      return;
    }
    // Only a refusal needs the camp's words.
    CampLabels labels = SetupSeasons.labelsBySeason(
        new Set<Id>{ program.Season__c }
      )
      .get(program.Season__c);
    if (otherBlock) {
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
    if (otherLocation) {
      item.addError(
        'Location__c',
        SetupSeasons.otherSeason(labels, 'Location', term)
      );
    }
  }
}
