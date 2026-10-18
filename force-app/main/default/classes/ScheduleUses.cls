/**
 * How many schedules a bunk or an activity is in, so deleting it can say so first (decision 15,
 * Greg 2026-10-17: "Bunk 3 is in 2 schedules. Delete anyway?"; desktop
 * docs/adr/2026-07-30-deleting-a-record-a-schedule-uses.md §1, count first). Every schedule
 * counts: Manual Build and generated drafts, saved versions, and published ones. A schedule's
 * days keep the names they were saved with, so deleting the record leaves them readable.
 * Runs in user mode: only schedules the director can see are counted.
 */
public with sharing class ScheduleUses {
  public static Integer count(Id recordId) {
    if (recordId == null) {
      return 0;
    }
    Schema.SObjectType kind = recordId.getSObjectType();
    if (kind == Group__c.SObjectType) {
      return inSchedulesOf(programOf(recordId), null, recordId);
    }
    if (kind == Activity__c.SObjectType) {
      return inSchedulesOf(null, seasonOf(recordId), recordId);
    }
    return 0;
  }

  private static Id programOf(Id groupId) {
    List<Group__c> found = [
      SELECT Division__r.Program__c
      FROM Group__c
      WHERE Id = :groupId
      WITH USER_MODE
    ];
    return found.isEmpty() ? null : found[0].Division__r.Program__c;
  }

  private static Id seasonOf(Id activityId) {
    List<Activity__c> found = [
      SELECT Season__c
      FROM Activity__c
      WHERE Id = :activityId
      WITH USER_MODE
    ];
    return found.isEmpty() ? null : found[0].Season__c;
  }

  /**
   * The schedules of the program (for a bunk) or the season (for an activity) whose days name
   * the record. A day names a record by its Id, 15 or 18 characters, in its groups or items.
   */
  private static Integer inSchedulesOf(Id programId, Id seasonId, Id recordId) {
    if (programId == null && seasonId == null) {
      return 0;
    }
    String key = String.valueOf(recordId).left(15);
    Set<Id> found = new Set<Id>();
    for (ScheduleDay__c part : [
      SELECT Schedule__c, Grid__c
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Program__c = :programId
        OR Schedule__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      if (part.Grid__c != null && part.Grid__c.contains(key)) {
        found.add(part.Schedule__c);
      }
    }
    return found.size();
  }
}
