trigger LocationTrigger on Location__c(
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
