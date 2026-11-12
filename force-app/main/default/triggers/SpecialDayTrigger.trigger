trigger SpecialDayTrigger on SpecialDay__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  SpecialItemTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
