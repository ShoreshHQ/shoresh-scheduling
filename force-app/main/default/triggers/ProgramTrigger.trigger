trigger ProgramTrigger on Program__c(
  before insert,
  before update,
  before delete,
  after update,
  after delete,
  after undelete
) {
  ArchivedSeasons.refuseChanges();
  ProgramTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
