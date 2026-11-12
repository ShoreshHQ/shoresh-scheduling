trigger TimeBlockTrigger on TimeBlock__c(
  before insert,
  before update,
  before delete,
  after insert,
  after update,
  after delete,
  after undelete
) {
  ArchivedSeasons.refuseChanges();
  TimeBlockTriggerHandler.handle(
    Trigger.operationType,
    Trigger.isDelete ? Trigger.old : Trigger.new,
    Trigger.oldMap
  );
}
