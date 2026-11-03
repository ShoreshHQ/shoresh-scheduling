trigger LocationTrigger on Location__c(
  before delete,
  before insert,
  before update,
  after update
) {
  if (Trigger.isDelete && Trigger.isBefore) {
    WeekExceptions.goWith(Trigger.oldMap.keySet());
    return;
  }
  LocationTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
