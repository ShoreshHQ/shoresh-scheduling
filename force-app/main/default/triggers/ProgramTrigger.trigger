trigger ProgramTrigger on Program__c(before delete, after update) {
  ProgramTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
