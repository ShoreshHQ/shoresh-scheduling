trigger ActivityTrigger on Activity__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  ActivityTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
