trigger LocationTrigger on Location__c(
  before delete,
  before insert,
  before update,
  after update
) {
  LocationTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
