trigger GroupTrigger on Group__c(
  before update,
  after insert,
  after update,
  after delete,
  after undelete
) {
  GroupTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
