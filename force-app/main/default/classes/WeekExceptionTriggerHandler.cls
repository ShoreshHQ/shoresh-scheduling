/** Week exceptions: what doesn't run must belong to the same season as the week. */
public with sharing class WeekExceptionTriggerHandler {
  public static void beforeSave(List<WeekException__c> exceptions) {
    Set<Id> weekIds = new Set<Id>();
    Set<Id> groupIds = new Set<Id>();
    for (WeekException__c row : exceptions) {
      weekIds.add(row.Week__c);
      if (row.Group__c != null) {
        groupIds.add(row.Group__c);
      }
    }
    Map<Id, Week__c> weeks = new Map<Id, Week__c>(
      [
        SELECT Id, Season__c, Season__r.Camp__c
        FROM Week__c
        WHERE Id IN :weekIds
        WITH SYSTEM_MODE
      ]
    );
    Map<Id, Group__c> groups = new Map<Id, Group__c>(
      [
        SELECT Id, Division__r.Program__r.Season__c
        FROM Group__c
        WHERE Id IN :groupIds
        WITH SYSTEM_MODE
      ]
    );
    Set<Id> campIds = new Set<Id>();
    for (Week__c week : weeks.values()) {
      campIds.add(week.Season__r.Camp__c);
    }
    Map<Id, CampLabels> labelsByCamp = CampLabels.forCamps(campIds);
    for (WeekException__c row : exceptions) {
      Week__c week = weeks.get(row.Week__c);
      Group__c target = groups.get(row.Group__c);
      if (
        week != null &&
        target != null &&
        target.Division__r.Program__r.Season__c != week.Season__c
      ) {
        CampLabels labels = labelsByCamp.get(week.Season__r.Camp__c);
        row.Group__c.addError(
          'This ' +
            labels.singularInSentence('Group') +
            ' belongs to a different ' +
            labels.singularInSentence('Season') +
            ' than the ' +
            labels.singularInSentence('Week') +
            '.'
        );
      }
    }
  }
}
