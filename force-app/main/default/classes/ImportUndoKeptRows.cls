/**
 * Undo's rows that go with their item (ImportUndoDeletes): who a recurring activity covers, the
 * weeks an item is off, the boxes of When it runs an activity is off (ADR 0031 A7) and who leads
 * it (piece B). Of the
 * rows an import made, those whose item this Undo keeps are kept with it.
 */
public with sharing class ImportUndoKeptRows {
  /** Of these rows of one kind (term), the ones whose item is among keptIds. */
  public static Set<Id> keptWith(String term, Set<Id> ids, Set<Id> keptIds) {
    if (term == 'ActivityOffTime') {
      return new Map<Id, ActivityOffTime__c>(
          [
            SELECT Id
            FROM ActivityOffTime__c
            WHERE Id IN :ids AND Activity__c IN :keptIds
            WITH USER_MODE
          ]
        )
        .keySet();
    }
    if (term == 'ActivityLeader') {
      return new Map<Id, ActivityLeader__c>(
          [
            SELECT Id
            FROM ActivityLeader__c
            WHERE
              Id IN :ids
              AND (Activity__c IN :keptIds
              OR StaffMember__c IN :keptIds)
            WITH USER_MODE
          ]
        )
        .keySet();
    }
    if (term == 'Coverage') {
      return new Map<Id, Coverage__c>(
          [
            SELECT Id
            FROM Coverage__c
            WHERE Id IN :ids AND RecurringActivity__c IN :keptIds
            WITH USER_MODE
          ]
        )
        .keySet();
    }
    return new Map<Id, WeekException__c>(
        [
          SELECT Id
          FROM WeekException__c
          WHERE
            Id IN :ids
            AND (Group__c IN :keptIds
            OR Location__c IN :keptIds
            OR Activity__c IN :keptIds
            OR FixedActivity__c IN :keptIds
            OR RecurringActivity__c IN :keptIds)
          WITH USER_MODE
        ]
      )
      .keySet();
  }
}
