trigger ProgramTrigger on Program__c(before delete, after update) {
  if (Trigger.isDelete) {
    ProgramTriggerHandler.beforeDelete(Trigger.oldMap);
  } else {
    SetTimeTriggers.programsSaved(Trigger.new, Trigger.oldMap);
  }
}
