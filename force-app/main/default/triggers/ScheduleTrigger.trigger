trigger ScheduleTrigger on Schedule__c(
  before insert,
  before update,
  before delete
) {
  ScheduleTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
