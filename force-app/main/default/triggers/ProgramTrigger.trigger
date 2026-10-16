trigger ProgramTrigger on Program__c(
  before delete,
  after update,
  after undelete
) {
  ProgramTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
