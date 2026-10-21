trigger SpecialDayTrigger on SpecialDay__c(
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
