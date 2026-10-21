trigger SpecialEventTrigger on SpecialEvent__c(
  before insert,
  before update,
  before delete
) {
  SpecialItemTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
