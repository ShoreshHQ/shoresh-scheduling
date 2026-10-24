/**
 * Linked choices, their periods and who they are for (repo ADR 0018). A linked choice links an
 * offering of its own set; its periods are time blocks of its season; its Coverage rows name
 * whole divisions of its season. Deleting a linked choice takes its Coverage rows with it.
 *
 * Its reads are in system mode on purpose (repo ADR 0018 choice 60): they read only the set and
 * season of what a linked choice names, to keep it inside its season whoever saves it, and return
 * no name to anyone. Sharing still applies (the class is with sharing).
 */
public with sharing class LinkedChoiceTriggers {
  /** The linked choice trigger: before insert, update and delete. */
  public static void handle(
    System.TriggerOperation operation,
    List<LinkedChoice__c> choices,
    Map<Id, LinkedChoice__c> oldChoices
  ) {
    if (operation == System.TriggerOperation.BEFORE_DELETE) {
      linkedChoicesDeleting(oldChoices.keySet());
    } else {
      linkedChoicesSaving(choices);
    }
  }

  /** The offering a linked choice links must be in the same elective set. */
  public static void linkedChoicesSaving(List<LinkedChoice__c> choices) {
    Set<Id> offeringIds = new Set<Id>();
    Set<Id> setIds = new Set<Id>();
    for (LinkedChoice__c choice : choices) {
      offeringIds.add(choice.Offering__c);
      setIds.add(choice.ElectiveSet__c);
    }
    Map<Id, Id> setOfOffering = new Map<Id, Id>();
    for (Offering__c offering : [
      SELECT Id, ElectiveSet__c
      FROM Offering__c
      WHERE Id IN :offeringIds
      WITH SYSTEM_MODE
    ]) {
      setOfOffering.put(offering.Id, offering.ElectiveSet__c);
    }
    Map<Id, Id> seasonOfSet;
    SetupSeasons.LazyLabels labelsBySeason;
    for (LinkedChoice__c choice : choices) {
      Id offeringSet = setOfOffering.get(choice.Offering__c);
      if (offeringSet == null || offeringSet == choice.ElectiveSet__c) {
        continue;
      }
      // Only a refusal needs the camp's words.
      if (seasonOfSet == null) {
        seasonOfSet = ElectiveSetupTriggers.seasonsOfSets(setIds);
        labelsBySeason = SetupSeasons.labelsWhenNeeded(
          new Set<Id>(seasonOfSet.values())
        );
      }
      CampLabels labels = labelsBySeason.get(
        seasonOfSet.get(choice.ElectiveSet__c)
      );
      choice.Offering__c.addError(
        'This ' +
          labels.singularInSentence('Offering') +
          ' is in a different ' +
          labels.singularInSentence('ElectiveSet') +
          ' than the ' +
          labels.singularInSentence('LinkedChoice') +
          '.'
      );
    }
  }

  /** A linked choice's Coverage rows point at it through a restrict-delete lookup: they go first. */
  public static void linkedChoicesDeleting(Set<Id> choiceIds) {
    // System mode on purpose: the rows mean nothing without their linked choice.
    ElectiveSetupTriggers.clear(
      [
        SELECT Id
        FROM Coverage__c
        WHERE LinkedChoice__c IN :choiceIds
        WITH SYSTEM_MODE
      ]
    );
  }

  /** A linked choice's period must be a time block of the same season. */
  public static void linkedChoiceTimesSaving(List<LinkedChoiceTime__c> times) {
    Set<Id> choiceIds = new Set<Id>();
    Set<Id> blockIds = new Set<Id>();
    for (LinkedChoiceTime__c row : times) {
      choiceIds.add(row.LinkedChoice__c);
      blockIds.add(row.TimeBlock__c);
    }
    Map<Id, Id> seasonOfChoice = new Map<Id, Id>();
    for (LinkedChoice__c choice : [
      SELECT Id, ElectiveSet__r.Season__c
      FROM LinkedChoice__c
      WHERE Id IN :choiceIds
      WITH SYSTEM_MODE
    ]) {
      seasonOfChoice.put(choice.Id, choice.ElectiveSet__r.Season__c);
    }
    Map<Id, Id> seasonOfBlock = new Map<Id, Id>();
    for (TimeBlock__c block : [
      SELECT Id, Program__r.Season__c
      FROM TimeBlock__c
      WHERE Id IN :blockIds
      WITH SYSTEM_MODE
    ]) {
      seasonOfBlock.put(block.Id, block.Program__r.Season__c);
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      new Set<Id>(seasonOfChoice.values())
    );
    for (LinkedChoiceTime__c row : times) {
      Id seasonId = seasonOfChoice.get(row.LinkedChoice__c);
      Id blockSeason = seasonOfBlock.get(row.TimeBlock__c);
      if (blockSeason != null && blockSeason != seasonId) {
        row.TimeBlock__c.addError(
          SetupSeasons.otherSeason(
            labelsBySeason.get(seasonId),
            'TimeBlock',
            'LinkedChoice'
          )
        );
      }
    }
  }

  // ---------------------------------------------------------------- who a linked choice is for

  /**
   * Coverage rows owned by a linked choice: a division (never a single group), in the linked
   * choice's season, and the row itself in that season.
   */
  public static void linkedChoiceCoverageSaving(List<Coverage__c> rows) {
    Set<Id> choiceIds = new Set<Id>();
    Set<Id> divisionIds = new Set<Id>();
    for (Coverage__c row : rows) {
      choiceIds.add(row.LinkedChoice__c);
      divisionIds.add(row.Division__c);
    }
    // The season of each linked choice and division named.
    Map<Id, Id> seasonOf = new Map<Id, Id>();
    for (LinkedChoice__c choice : [
      SELECT Id, ElectiveSet__r.Season__c
      FROM LinkedChoice__c
      WHERE Id IN :choiceIds
      WITH SYSTEM_MODE
    ]) {
      seasonOf.put(choice.Id, choice.ElectiveSet__r.Season__c);
    }
    Set<Id> choiceSeasons = new Set<Id>(seasonOf.values());
    for (Division__c division : [
      SELECT Id, Program__r.Season__c
      FROM Division__c
      WHERE Id IN :divisionIds
      WITH SYSTEM_MODE
    ]) {
      seasonOf.put(division.Id, division.Program__r.Season__c);
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      choiceSeasons
    );
    for (Coverage__c row : rows) {
      if (seasonOf.containsKey(row.LinkedChoice__c)) {
        refuseCoverage(row, seasonOf, labelsBySeason);
      }
    }
  }

  /** A row naming a group, or anything outside the linked choice's season, is refused. */
  private static void refuseCoverage(
    Coverage__c row,
    Map<Id, Id> seasonOf,
    SetupSeasons.LazyLabels labelsBySeason
  ) {
    Id seasonId = seasonOf.get(row.LinkedChoice__c);
    if (row.Group__c != null) {
      CampLabels labels = labelsBySeason.get(seasonId);
      row.Group__c.addError(
        'Choose a ' +
          labels.singularInSentence('Division') +
          ': a ' +
          labels.singularInSentence('LinkedChoice') +
          ' is for whole ' +
          labels.pluralInSentence('Division') +
          '.'
      );
      return;
    }
    Id divisionSeason = seasonOf.get(row.Division__c);
    if (
      row.Season__c != seasonId ||
      (divisionSeason != null &&
      divisionSeason != seasonId)
    ) {
      row.addError(
        SetupSeasons.otherSeason(
          labelsBySeason.get(seasonId),
          'Division',
          'LinkedChoice'
        )
      );
    }
  }
}
