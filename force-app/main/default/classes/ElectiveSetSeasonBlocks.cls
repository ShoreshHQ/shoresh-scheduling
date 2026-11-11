/**
 * An elective set's time (repo ADR 0027) is in a time block of its own season, never another's:
 * ElectiveSetupTriggers refuses one that isn't, before it is saved.
 */
public with sharing class ElectiveSetSeasonBlocks {
  public static void refuse(
    List<ElectiveSet__c> sets,
    SetupSeasons.LazyLabels labelsBySeason
  ) {
    Set<Id> blockIds = new Set<Id>();
    for (ElectiveSet__c item : sets) {
      if (item.TimeBlock__c != null) {
        blockIds.add(item.TimeBlock__c);
      }
    }
    if (blockIds.isEmpty()) {
      return;
    }
    // System mode, as the trigger's other checks (ADR 0001 point 6): only the block's season is
    // read, and the refusal says nothing about the other season.
    Map<Id, TimeBlock__c> blocks = new Map<Id, TimeBlock__c>(
      [
        SELECT Id, Program__r.Season__c
        FROM TimeBlock__c
        WHERE Id IN :blockIds
        WITH SYSTEM_MODE
      ]
    );
    for (ElectiveSet__c item : sets) {
      TimeBlock__c block = blocks.get(item.TimeBlock__c);
      if (block != null && block.Program__r.Season__c != item.Season__c) {
        CampLabels labels = labelsBySeason.get(item.Season__c);
        item.TimeBlock__c.addError(
          'That ' +
            labels.singularInSentence('TimeBlock') +
            ' belongs to another ' +
            labels.singularInSentence('Season') +
            '.'
        );
      }
    }
  }
}
