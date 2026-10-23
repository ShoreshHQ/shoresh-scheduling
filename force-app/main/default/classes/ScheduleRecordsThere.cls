/**
 * Which of some records a schedule's days point at are still there and can be seen (ScheduleRefs):
 * time blocks, groups, activities, fixed and recurring activities, special events and days (ADR
 * 0014 slice 4), elective sets (ADR 0018 slice E5). Runs in user mode.
 */
public with sharing class ScheduleRecordsThere {
  /**
   * Each kind of record a day points at is looked for only when the day points at one, so a
   * week with no special events costs no query for them. A kind the user may not read is gone.
   */
  public static Set<String> of(Set<Id> ids) {
    Set<String> found = new Set<String>();
    Map<Schema.SObjectType, Set<Id>> byType = new Map<Schema.SObjectType, Set<Id>>();
    for (Id recordId : ids) {
      Schema.SObjectType type = recordId.getSObjectType();
      if (!byType.containsKey(type)) {
        byType.put(type, new Set<Id>());
      }
      byType.get(type).add(recordId);
    }
    for (Schema.SObjectType type : byType.keySet()) {
      if (type.getDescribe().isAccessible()) {
        for (SObject row : present(type, byType.get(type))) {
          found.add(row.Id);
        }
      }
    }
    return found;
  }

  /** The records of one kind that are still there (special events and days: ADR 0014 slice 4). */
  private static List<SObject> present(Schema.SObjectType type, Set<Id> ids) {
    if (type == TimeBlock__c.SObjectType) {
      return [SELECT Id FROM TimeBlock__c WHERE Id IN :ids WITH USER_MODE];
    }
    if (type == Group__c.SObjectType) {
      return [SELECT Id FROM Group__c WHERE Id IN :ids WITH USER_MODE];
    }
    if (type == Activity__c.SObjectType) {
      return [SELECT Id FROM Activity__c WHERE Id IN :ids WITH USER_MODE];
    }
    if (type == FixedActivity__c.SObjectType) {
      return [SELECT Id FROM FixedActivity__c WHERE Id IN :ids WITH USER_MODE];
    }
    if (type == RecurringActivity__c.SObjectType) {
      return [
        SELECT Id
        FROM RecurringActivity__c
        WHERE Id IN :ids
        WITH USER_MODE
      ];
    }
    if (type == SpecialEvent__c.SObjectType) {
      return [SELECT Id FROM SpecialEvent__c WHERE Id IN :ids WITH USER_MODE];
    }
    if (type == SpecialDay__c.SObjectType) {
      return [SELECT Id FROM SpecialDay__c WHERE Id IN :ids WITH USER_MODE];
    }
    if (type == ElectiveSet__c.SObjectType) {
      return [SELECT Id FROM ElectiveSet__c WHERE Id IN :ids WITH USER_MODE];
    }
    return new List<SObject>();
  }
}
