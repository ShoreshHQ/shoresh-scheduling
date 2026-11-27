/**
 * Prepares an elective set's delete (repo ADR 0018; ELECT-7.4), for ElectiveSetupTriggers: a set
 * with seats is refused, naming their weeks; otherwise the rows that would block its delete go
 * first.
 *
 * System mode on purpose (repo ADR 0018 choice 60): a refused set's delete names its runs, which
 * its own season's scheduler can read anyway, and the rows cleared go with the set.
 */
public with sharing class ElectiveSetDeletes {
  /**
   * A set with seats is refused, naming their weeks (as the desktop refuses a week with runs).
   * Otherwise its linked choices and their Coverage rows are cleared first: they point at the
   * set's offerings through restrict-delete lookups, which would block the set's own delete. So
   * are the rows saying who its time is for (ELECT-7.4), for the same reason.
   */
  public static void prepare(Map<Id, ElectiveSet__c> oldSets) {
    Map<Id, List<ElectiveRun__c>> runsBySet = new Map<Id, List<ElectiveRun__c>>();
    for (ElectiveRun__c run : [
      SELECT Name, ElectiveSet__c, ElectiveSet__r.Name, Week__r.Name
      FROM ElectiveRun__c
      WHERE ElectiveSet__c IN :oldSets.keySet()
      WITH SYSTEM_MODE
      ORDER BY Week__r.StartDate__c, Name, Id
    ]) {
      if (!runsBySet.containsKey(run.ElectiveSet__c)) {
        runsBySet.put(run.ElectiveSet__c, new List<ElectiveRun__c>());
      }
      runsBySet.get(run.ElectiveSet__c).add(run);
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
      List<ElectiveRun__c> runs = runsBySet.get(item.Id);
      if (runs == null) {
        deletable.add(item.Id);
        continue;
      }
      // Word walk W4: "Chugim has seats in Week 1 and Week 2. Clear them first."
      item.addError(
        SetupDeleteWords.setHasSeats(runs, labelsBySeason.get(item.Season__c))
      );
    }
    if (deletable.isEmpty()) {
      return;
    }
    // System mode on purpose: these rows go with the set anyway (master-detail), and someone
    // allowed to delete the set must not be stopped by a row they cannot see.
    ElectiveSetupTriggers.clear(
      [
        SELECT Id
        FROM Coverage__c
        WHERE
          LinkedChoice__r.ElectiveSet__c IN :deletable
          OR ElectiveSet__c IN :deletable
        WITH SYSTEM_MODE
      ]
    );
    ElectiveSetupTriggers.clear(
      [
        SELECT Id
        FROM LinkedChoice__c
        WHERE ElectiveSet__c IN :deletable
        WITH SYSTEM_MODE
      ]
    );
  }
}
