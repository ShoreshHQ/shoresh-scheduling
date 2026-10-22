/**
 * Elective sets, offerings, linked choices and their times (repo ADR 0018). Fills the hidden keys
 * so a set's name is used once in a season and an activity is offered once in a set, with
 * messages in the camp's words; keeps every record inside its own season and set; and prepares
 * deletes: an elective set a run uses is refused, naming the runs, and otherwise takes its linked
 * choices with it; a linked choice takes its Coverage rows with it.
 */
public with sharing class ElectiveSetupTriggers {
  // ---------------------------------------------------------------- elective sets

  public static void setsSaving(List<ElectiveSet__c> sets) {
    Set<Id> seasonIds = new Set<Id>();
    Set<String> keys = new Set<String>();
    Set<Id> savingIds = new Set<Id>();
    for (ElectiveSet__c item : sets) {
      item.Key__c = setKey(item);
      keys.add(item.Key__c);
      seasonIds.add(item.Season__c);
      if (item.Id != null) {
        savingIds.add(item.Id);
      }
    }
    // Friendly duplicate check; the unique key is the backstop. Sets in this save are compared
    // with their new names, so swapping two names in one save is fine.
    Set<String> taken = new Set<String>();
    for (ElectiveSet__c existing : [
      SELECT Key__c
      FROM ElectiveSet__c
      WHERE Key__c IN :keys AND Id NOT IN :savingIds
      WITH SYSTEM_MODE
    ]) {
      taken.add(existing.Key__c);
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      seasonIds
    );
    for (ElectiveSet__c item : sets) {
      if (!taken.add(item.Key__c)) {
        CampLabels labels = labelsBySeason.get(item.Season__c);
        item.Name.addError(
          'Another ' +
            labels.singularInSentence('ElectiveSet') +
            ' in this ' +
            labels.singularInSentence('Season') +
            ' is called "' +
            item.Name.trim() +
            '".'
        );
      }
    }
  }

  /**
   * A set a run uses is refused, naming the runs (as the desktop refuses a week with runs).
   * Otherwise its linked choices and their Coverage rows are cleared first: they point at the
   * set's offerings through restrict-delete lookups, which would block the set's own delete.
   */
  public static void setsDeleting(Map<Id, ElectiveSet__c> oldSets) {
    Map<Id, List<String>> runsBySet = new Map<Id, List<String>>();
    for (ElectiveRun__c run : [
      SELECT Name, ElectiveSet__c
      FROM ElectiveRun__c
      WHERE ElectiveSet__c IN :oldSets.keySet()
      WITH SYSTEM_MODE
      ORDER BY Name, Id
    ]) {
      if (!runsBySet.containsKey(run.ElectiveSet__c)) {
        runsBySet.put(run.ElectiveSet__c, new List<String>());
      }
      runsBySet.get(run.ElectiveSet__c).add(run.Name);
    }
    Set<Id> seasonIds = new Set<Id>();
    for (ElectiveSet__c item : oldSets.values()) {
      seasonIds.add(item.Season__c);
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      seasonIds
    );
    Set<Id> deletable = new Set<Id>();
    for (ElectiveSet__c item : oldSets.values()) {
      List<String> runs = runsBySet.get(item.Id);
      if (runs == null) {
        deletable.add(item.Id);
        continue;
      }
      CampLabels labels = labelsBySeason.get(item.Season__c);
      item.addError(
        'This ' +
          labels.singularInSentence('ElectiveSet') +
          ' can\'t be deleted yet: it has elective runs: ' +
          InUse.quoted(runs) +
          '. First delete ' +
          (runs.size() == 1 ? 'that run' : 'those runs') +
          ', then delete it.'
      );
    }
    if (deletable.isEmpty()) {
      return;
    }
    // System mode on purpose: these rows go with the set anyway (master-detail), and someone
    // allowed to delete the set must not be stopped by a row they cannot see.
    clear(
      [
        SELECT Id
        FROM Coverage__c
        WHERE LinkedChoice__r.ElectiveSet__c IN :deletable
        WITH SYSTEM_MODE
      ]
    );
    clear(
      [
        SELECT Id
        FROM LinkedChoice__c
        WHERE ElectiveSet__c IN :deletable
        WITH SYSTEM_MODE
      ]
    );
  }

  /** Season and name, ignoring spaces and capitals: "Chugim" and "chu gim" are one name. */
  @TestVisible
  private static String setKey(ElectiveSet__c item) {
    return item.Season__c +
      '|' +
      (item.Name == null ? '' : item.Name.deleteWhitespace().toLowerCase());
  }

  // ---------------------------------------------------------------- offerings

  public static void offeringsSaving(List<Offering__c> offerings) {
    Set<Id> setIds = new Set<Id>();
    Set<Id> activityIds = new Set<Id>();
    Set<String> keys = new Set<String>();
    Set<Id> savingIds = new Set<Id>();
    for (Offering__c offering : offerings) {
      offering.Key__c = offering.ElectiveSet__c + '|' + offering.Activity__c;
      keys.add(offering.Key__c);
      setIds.add(offering.ElectiveSet__c);
      activityIds.add(offering.Activity__c);
      if (offering.Id != null) {
        savingIds.add(offering.Id);
      }
    }
    Map<Id, Id> seasonOfSet = seasonsOfSets(setIds);
    Map<Id, Id> seasonOfActivity = new Map<Id, Id>();
    for (Activity__c activity : [
      SELECT Id, Season__c
      FROM Activity__c
      WHERE Id IN :activityIds
      WITH SYSTEM_MODE
    ]) {
      seasonOfActivity.put(activity.Id, activity.Season__c);
    }
    Set<String> taken = new Set<String>();
    for (Offering__c existing : [
      SELECT Key__c
      FROM Offering__c
      WHERE Key__c IN :keys AND Id NOT IN :savingIds
      WITH SYSTEM_MODE
    ]) {
      taken.add(existing.Key__c);
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      new Set<Id>(seasonOfSet.values())
    );
    for (Offering__c offering : offerings) {
      Id seasonId = seasonOfSet.get(offering.ElectiveSet__c);
      Id activitySeason = seasonOfActivity.get(offering.Activity__c);
      if (activitySeason != null && activitySeason != seasonId) {
        offering.Activity__c.addError(
          SetupSeasons.otherSeason(
            labelsBySeason.get(seasonId),
            'Activity',
            'ElectiveSet'
          )
        );
      } else if (!taken.add(offering.Key__c)) {
        CampLabels labels = labelsBySeason.get(seasonId);
        offering.Activity__c.addError(
          'This ' +
            labels.singularInSentence('Activity') +
            ' is already offered in this ' +
            labels.singularInSentence('ElectiveSet') +
            '.'
        );
      }
    }
  }

  // ---------------------------------------------------------------- linked choices

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
        seasonOfSet = seasonsOfSets(setIds);
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
    clear(
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
    Map<Id, Id> seasonOfChoice = new Map<Id, Id>();
    for (LinkedChoice__c choice : [
      SELECT Id, ElectiveSet__r.Season__c
      FROM LinkedChoice__c
      WHERE Id IN :choiceIds
      WITH SYSTEM_MODE
    ]) {
      seasonOfChoice.put(choice.Id, choice.ElectiveSet__r.Season__c);
    }
    Map<Id, Id> seasonOfDivision = new Map<Id, Id>();
    for (Division__c division : [
      SELECT Id, Program__r.Season__c
      FROM Division__c
      WHERE Id IN :divisionIds
      WITH SYSTEM_MODE
    ]) {
      seasonOfDivision.put(division.Id, division.Program__r.Season__c);
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      new Set<Id>(seasonOfChoice.values())
    );
    for (Coverage__c row : rows) {
      Id seasonId = seasonOfChoice.get(row.LinkedChoice__c);
      if (seasonId == null) {
        continue;
      }
      CampLabels labels;
      if (row.Group__c != null) {
        labels = labelsBySeason.get(seasonId);
        row.Group__c.addError(
          'Choose a ' +
            labels.singularInSentence('Division') +
            ': a ' +
            labels.singularInSentence('LinkedChoice') +
            ' is for whole ' +
            labels.pluralInSentence('Division') +
            '.'
        );
      } else if (
        row.Season__c != seasonId ||
        (seasonOfDivision.containsKey(row.Division__c) &&
        seasonOfDivision.get(row.Division__c) != seasonId)
      ) {
        labels = labelsBySeason.get(seasonId);
        row.addError(
          SetupSeasons.otherSeason(labels, 'Division', 'LinkedChoice')
        );
      }
    }
  }

  // ---------------------------------------------------------------- shared

  private static Map<Id, Id> seasonsOfSets(Set<Id> setIds) {
    Map<Id, Id> result = new Map<Id, Id>();
    for (ElectiveSet__c item : [
      SELECT Id, Season__c
      FROM ElectiveSet__c
      WHERE Id IN :setIds
      WITH SYSTEM_MODE
    ]) {
      result.put(item.Id, item.Season__c);
    }
    return result;
  }

  private static void clear(List<SObject> rows) {
    if (!rows.isEmpty()) {
      Database.delete(rows, true, AccessLevel.SYSTEM_MODE);
    }
  }
}
