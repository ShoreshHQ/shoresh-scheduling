trigger LocationTrigger on Location__c(
  before insert,
  before update,
  before delete,
  after update
) {
  ArchivedSeasons.refuseChanges();
  LocationTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
