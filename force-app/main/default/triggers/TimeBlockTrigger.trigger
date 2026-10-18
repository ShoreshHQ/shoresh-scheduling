trigger TimeBlockTrigger on TimeBlock__c(
  before insert,
  before update,
  after insert,
  after update,
  after delete,
  after undelete
) {
  TimeBlockTriggerHandler.handle(
    Trigger.operationType,
    Trigger.isDelete ? Trigger.old : Trigger.new,
    Trigger.oldMap
  );
}
