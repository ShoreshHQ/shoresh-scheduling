/**
 * Who a recurring activity covers: the row belongs to the recurring activity's season, and the
 * division or group named must be in the recurring activity's own program.
 */
public with sharing class CoverageTriggerHandler {
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
    Map<Id, Id> programOf = programsOf(targetIds);
    Set<Id> seasonIds = new Set<Id>();
    for (RecurringActivity__c owner : owners.values()) {
      seasonIds.add(owner.Program__r.Season__c);
    }
    Map<Id, CampLabels> labelsBySeason = SetupSeasons.labelsBySeason(seasonIds);
    for (Coverage__c row : rows) {
      RecurringActivity__c owner = owners.get(row.RecurringActivity__c);
      if (owner == null) {
        continue;
      }
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
        programOf.containsKey(target) &&
        programOf.get(target) != owner.Program__c
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
  }

  /** The program of each division and group named. */
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
