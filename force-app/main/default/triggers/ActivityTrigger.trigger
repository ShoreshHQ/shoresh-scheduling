trigger ActivityTrigger on Activity__c(
  before delete,
  before insert,
  before update
) {
  ActivityTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
