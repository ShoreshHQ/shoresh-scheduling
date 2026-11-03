trigger GroupTrigger on Group__c(
  before delete,
  before update,
  after insert,
  after update,
  after delete,
  after undelete
) {
  if (Trigger.isDelete && Trigger.isBefore) {
    WeekExceptions.goWith(Trigger.oldMap.keySet());
    return;
  }
  GroupTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
