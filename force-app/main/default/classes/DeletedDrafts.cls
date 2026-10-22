/**
 * Drafts deleted or restored with their schedule or program (ADR 0014 choice 20). Salesforce runs
 * no trigger on the days a delete takes along, so the weeks whose drafts go and that have an event
 * on a day are noted before the delete and their event days made again after it
 * (SpecialEventDays.sync); a draft restored from the Recycle Bin puts its events back. Otherwise an
 * event would stay on a day no schedule shows, and could never be deleted.
 * Runs in user mode, as SpecialEventDays does.
 */
public with sharing class DeletedDrafts {
  // Weeks whose drafts a delete in progress takes along (beforeDelete, afterDelete).
  private static Set<Id> weeksLeaving = new Set<Id>();

  /** Before schedules or programs are deleted (their ids). One query. */
  public static void beforeDelete(Set<Id> scheduleOrProgramIds) {
    for (Schedule__c schedule : [
      SELECT Week__c
      FROM Schedule__c
      WHERE
        (Id IN :scheduleOrProgramIds
        OR Program__c IN :scheduleOrProgramIds)
        AND Status__c = :ManualDrafts.DRAFT
        AND Week__c IN (
          SELECT Week__c
          FROM SpecialDate__c
          WHERE SpecialEvent__c != NULL
        )
      WITH USER_MODE
    ]) {
      weeksLeaving.add(schedule.Week__c);
    }
  }

  /** After schedules or programs are deleted: the weeks noted before it, made what is left. */
  public static void afterDelete() {
    Set<Id> weekIds = weeksLeaving;
    weeksLeaving = new Set<Id>();
    syncWhenAllowed(weekIds);
  }

  /** After schedules or programs come back from the Recycle Bin: their drafts' weeks again. */
  public static void afterUndelete(Set<Id> scheduleOrProgramIds) {
    Set<Id> weekIds = new Set<Id>();
    for (Schedule__c schedule : [
      SELECT Week__c
      FROM Schedule__c
      WHERE
        (Id IN :scheduleOrProgramIds
        OR Program__c IN :scheduleOrProgramIds)
        AND Status__c = :ManualDrafts.DRAFT
      WITH USER_MODE
    ]) {
      weekIds.add(schedule.Week__c);
    }
    syncWhenAllowed(weekIds);
  }

  private static void syncWhenAllowed(Set<Id> weekIds) {
    if (
      !weekIds.isEmpty() && Schema.sObjectType.SpecialDate__c.isCreateable()
    ) {
      SpecialEventDays.sync(weekIds);
    }
  }
}
