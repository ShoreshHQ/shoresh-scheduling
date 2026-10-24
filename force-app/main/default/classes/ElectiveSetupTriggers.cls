/**
 * Elective sets and offerings (repo ADR 0018; linked choices are in LinkedChoiceTriggers). Fills
 * the hidden keys so a set's name is used once in a season and an activity is offered once in a
 * set, with messages in the camp's words; keeps offerings inside their season; and prepares a
 * set's delete: a set a run uses is refused, naming the runs, and otherwise takes its linked
 * choices with it. An offering's delete takes its linked choices too (the desktop's
 * deleteBundleRows when an offering is removed); seats that name it still refuse it.
 *
 * System mode on purpose (repo ADR 0018 choice 60): the key checks read only hidden keys (no one
 * is granted Key__c; these triggers fill it), the season checks only seasons, and a refused
 * set's delete names its runs, which its own season's scheduler can read anyway; the rows
 * cleared with a set or an offering go with it (see each delete). Sharing still applies (the
 * class is with sharing).
 */
public with sharing class ElectiveSetupTriggers {
  /** The elective set trigger: before insert, update and delete. */
  public static void handleSets(
    System.TriggerOperation operation,
    List<ElectiveSet__c> sets,
    Map<Id, ElectiveSet__c> oldSets
  ) {
    if (operation == System.TriggerOperation.BEFORE_DELETE) {
      setsDeleting(oldSets);
    } else {
      setsSaving(sets);
    }
  }

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
          ' can\'t be deleted yet: it has ' +
          labels.singularInSentence('Elective') +
          ' runs: ' +
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

  /** The offering trigger: before insert, update and delete. */
  public static void handleOfferings(
    System.TriggerOperation operation,
    List<Offering__c> offerings,
    Map<Id, Offering__c> oldOfferings
  ) {
    if (operation == System.TriggerOperation.BEFORE_DELETE) {
      offeringsDeleting(oldOfferings.keySet());
    } else {
      offeringsSaving(offerings);
    }
  }

  /**
   * An offering's linked choices go with it, and their Coverage rows (their periods are their
   * details): they point at it through a restrict-delete lookup, which would block its delete.
   * Seats in a run that name it still refuse the delete (the restrict lookup on Assignment__c;
   * the screens say so first, ElectivesInUse).
   */
  public static void offeringsDeleting(Set<Id> offeringIds) {
    // System mode on purpose, as for a set: they go with the offering, and someone allowed to
    // delete it must not be stopped by a row they cannot see.
    clear(
      [
        SELECT Id
        FROM Coverage__c
        WHERE LinkedChoice__r.Offering__c IN :offeringIds
        WITH SYSTEM_MODE
      ]
    );
    clear(
      [
        SELECT Id
        FROM LinkedChoice__c
        WHERE Offering__c IN :offeringIds
        WITH SYSTEM_MODE
      ]
    );
  }

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

  // ---------------------------------------------------------------- shared

  public static Map<Id, Id> seasonsOfSets(Set<Id> setIds) {
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

  public static void clear(List<SObject> rows) {
    if (!rows.isEmpty()) {
      Database.delete(rows, true, AccessLevel.SYSTEM_MODE);
    }
  }
}
