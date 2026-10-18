/**
 * Who a recurring activity covers: the row belongs to the recurring activity's season, and the
 * division or group named must be in the recurring activity's own program. After a save or
 * delete, the clash check runs (removing a row can widen it to everyone).
 */
public with sharing class CoverageTriggerHandler {
  // The program of each division and group named.
  private Map<Id, Id> programOf;
  private SetupSeasons.LazyLabels labelsBySeason;

  public static void handle(
    System.TriggerOperation operation,
    List<Coverage__c> rows,
    List<Coverage__c> oldRows
  ) {
    if (
      operation == System.TriggerOperation.BEFORE_INSERT ||
      operation == System.TriggerOperation.BEFORE_UPDATE
    ) {
      beforeSave(rows);
    } else {
      SetTimeTriggers.coverageChanged(
        operation == System.TriggerOperation.AFTER_DELETE ? oldRows : rows
      );
    }
  }

  public static void beforeSave(List<Coverage__c> rows) {
    Set<Id> ownerIds = new Set<Id>();
    Set<Id> targetIds = new Set<Id>();
    for (Coverage__c row : rows) {
      ownerIds.add(row.RecurringActivity__c);
      targetIds.add(row.Division__c);
      targetIds.add(row.Group__c);
    }
    Map<Id, RecurringActivity__c> owners = new Map<Id, RecurringActivity__c>(
      [
        SELECT Id, Program__c, Program__r.Season__c
        FROM RecurringActivity__c
        WHERE Id IN :ownerIds
        WITH SYSTEM_MODE
      ]
    );
    Set<Id> seasonIds = new Set<Id>();
    for (RecurringActivity__c owner : owners.values()) {
      seasonIds.add(owner.Program__r.Season__c);
    }
    CoverageTriggerHandler handler = new CoverageTriggerHandler();
    handler.programOf = programsOf(targetIds);
    handler.labelsBySeason = SetupSeasons.labelsWhenNeeded(seasonIds);
    for (Coverage__c row : rows) {
      RecurringActivity__c owner = owners.get(row.RecurringActivity__c);
      if (owner != null) {
        handler.check(row, owner);
      }
    }
  }

  private void check(Coverage__c row, RecurringActivity__c owner) {
    CampLabels labels = labelsBySeason.get(owner.Program__r.Season__c);
    Id target = row.Division__c != null ? row.Division__c : row.Group__c;
    if (row.Season__c != owner.Program__r.Season__c) {
      row.addError(
        'This row belongs to a different ' +
          labels.singularInSentence('Season') +
          ' than its ' +
          labels.singularInSentence('RecurringActivity') +
          '.'
      );
    } else if (
      programOf.containsKey(target) && programOf.get(target) != owner.Program__c
    ) {
      row.addError(
        'This ' +
          labels.singularInSentence(
            row.Division__c != null ? 'Division' : 'Group'
          ) +
          ' belongs to a different ' +
          labels.singularInSentence('Program') +
          ' than the ' +
          labels.singularInSentence('RecurringActivity') +
          '.'
      );
    }
  }

  private static Map<Id, Id> programsOf(Set<Id> targetIds) {
    Map<Id, Id> result = new Map<Id, Id>();
    for (Division__c division : [
      SELECT Id, Program__c
      FROM Division__c
      WHERE Id IN :targetIds
      WITH SYSTEM_MODE
    ]) {
      result.put(division.Id, division.Program__c);
    }
    for (Group__c grp : [
      SELECT Id, Division__r.Program__c
      FROM Group__c
      WHERE Id IN :targetIds
      WITH SYSTEM_MODE
    ]) {
      result.put(grp.Id, grp.Division__r.Program__c);
    }
    return result;
  }
}
