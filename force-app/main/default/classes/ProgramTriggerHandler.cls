/** Refuses deleting a program with published history. */
public with sharing class ProgramTriggerHandler {
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
