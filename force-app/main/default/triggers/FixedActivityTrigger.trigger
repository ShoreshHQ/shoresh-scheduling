trigger FixedActivityTrigger on FixedActivity__c(
  before delete,
  before insert,
  before update,
  after insert,
  after update,
  after undelete
) {
  if (Trigger.isDelete && Trigger.isBefore) {
    WeekExceptions.goWith(Trigger.oldMap.keySet());
    return;
  }
  SetTimeItemTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    'FixedActivity'
  );
}
