trigger ProgramTrigger on Program__c(before delete) {
  ProgramTriggerHandler.beforeDelete(Trigger.oldMap);
}
