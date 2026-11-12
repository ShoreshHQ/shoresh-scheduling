trigger CoverageTrigger on Coverage__c(
  before insert,
  before update,
  before delete,
  after insert,
  after update,
  after delete,
  after undelete
) {
  ArchivedSeasons.refuseChanges();
  CoverageTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.old
  );
}
