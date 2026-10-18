/**
 * How many schedules a bunk or an activity is in, so deleting it can say so first (decision 15,
 * Greg 2026-10-17: "Bunk 3 is in 2 schedules. Delete anyway?"; desktop
 * docs/adr/2026-07-30-deleting-a-record-a-schedule-uses.md §1, count first). Every schedule
 * counts: Manual Build and generated drafts, saved versions, and published ones. A schedule's
 * days keep the names they were saved with, so deleting the record leaves them readable.
 * Runs in user mode: only schedules the director can see are counted.
 */
public with sharing class ScheduleUses {
  // Day parts read at once: a part's text can be long, so a few at a time keeps memory low.
  private static final Integer PARTS_AT_ONCE = 25;

  public static Integer count(Id recordId) {
    if (recordId == null) {
      return 0;
    }
    Schema.SObjectType kind = recordId.getSObjectType();
    if (kind == Group__c.SObjectType) {
      return inSchedulesOf(partsOf(programOf(recordId), null), recordId);
    }
    if (kind == Activity__c.SObjectType) {
      return inSchedulesOf(partsOf(null, seasonOf(recordId)), recordId);
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

  /** The day parts of the program's (for a bunk) or the season's (for an activity) schedules. */
  private static List<ScheduleDay__c> partsOf(Id programId, Id seasonId) {
    if (programId == null && seasonId == null) {
      return new List<ScheduleDay__c>();
    }
    return [
      SELECT Id, Schedule__c
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Program__c = :programId
        OR Schedule__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Schedule__c, Date__c, Part__c
    ];
  }

  /**
   * The schedules whose days name the record, by its Id (15 or 18 characters) in their groups or
   * items. The text is read a few parts at a time, and a schedule already found is not read again.
   */
  private static Integer inSchedulesOf(
    List<ScheduleDay__c> parts,
    Id recordId
  ) {
    String key = String.valueOf(recordId).left(15);
    Set<Id> found = new Set<Id>();
    List<Id> batch = new List<Id>();
    for (Integer i = 0; i < parts.size(); i++) {
      if (!found.contains(parts[i].Schedule__c)) {
        batch.add(parts[i].Id);
      }
      if (batch.size() == PARTS_AT_ONCE || i == parts.size() - 1) {
        found.addAll(schedulesNaming(batch, key));
        batch.clear();
      }
    }
    return found.size();
  }

  private static Set<Id> schedulesNaming(List<Id> partIds, String key) {
    Set<Id> result = new Set<Id>();
    if (partIds.isEmpty()) {
      return result;
    }
    for (ScheduleDay__c part : [
      SELECT Schedule__c, Grid__c
      FROM ScheduleDay__c
      WHERE Id IN :partIds
      WITH USER_MODE
    ]) {
      if (part.Grid__c != null && part.Grid__c.contains(key)) {
        result.add(part.Schedule__c);
      }
    }
    return result;
  }
}
