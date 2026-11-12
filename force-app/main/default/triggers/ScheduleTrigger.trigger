trigger ScheduleTrigger on Schedule__c(
  before insert,
  before update,
  before delete,
  after delete,
  after undelete
) {
  ArchivedSeasons.refuseChanges();
  ScheduleTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
