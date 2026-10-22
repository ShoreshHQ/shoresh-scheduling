/**
 * Refuses deleting a program with published history; reports changed days to the clash check;
 * a program deleted or restored takes its drafts' special events off their days or puts them back
 * (DeletedDrafts).
 */
public with sharing class ProgramTriggerHandler {
  /**
   * Before delete: published history. After update: its days (SetTimeTriggers). After delete or
   * undelete: its drafts' event days (DeletedDrafts).
   */
  public static void handle(
    System.TriggerOperation operation,
    List<Program__c> programs,
    Map<Id, Program__c> before
  ) {
    if (operation == System.TriggerOperation.BEFORE_DELETE) {
      beforeDelete(before);
      DeletedDrafts.beforeDelete(before.keySet());
    } else if (operation == System.TriggerOperation.AFTER_DELETE) {
      DeletedDrafts.afterDelete();
    } else if (operation == System.TriggerOperation.AFTER_UNDELETE) {
      SetTimeTriggers.programsRestored(programs);
      DeletedDrafts.afterUndelete(new Map<Id, Program__c>(programs).keySet());
    } else {
      SetTimeTriggers.programsSaved(programs, before);
    }
  }

  public static void beforeDelete(Map<Id, Program__c> oldPrograms) {
    Map<Id, Id> campIdByProgramId = new Map<Id, Id>();
    for (Program__c program : [
      SELECT Id, Season__r.Camp__c
      FROM Program__c
      WHERE Id IN :oldPrograms.keySet()
      WITH SYSTEM_MODE
    ]) {
      campIdByProgramId.put(program.Id, program.Season__r.Camp__c);
    }
    PublishedHistory.refuseDeletes(
      oldPrograms.values(),
      'Program',
      campIdByProgramId
    );
  }
}
