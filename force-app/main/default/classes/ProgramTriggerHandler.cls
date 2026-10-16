/** Refuses deleting a program with published history; reports changed days to the clash check. */
public with sharing class ProgramTriggerHandler {
  /** Before delete: published history. After update: its days (SetTimeTriggers). */
  public static void handle(
    System.TriggerOperation operation,
    List<Program__c> programs,
    Map<Id, Program__c> before
  ) {
    if (operation == System.TriggerOperation.BEFORE_DELETE) {
      beforeDelete(before);
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
