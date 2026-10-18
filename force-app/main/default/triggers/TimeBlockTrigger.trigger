trigger TimeBlockTrigger on TimeBlock__c(
  before insert,
  before update,
  after insert,
  after update,
  after delete,
  after undelete
) {
  if (Trigger.isBefore) {
    TimeBlockTriggerHandler.beforeSave(Trigger.new, Trigger.oldMap);
    return;
  }
  SetTimeTriggers.timeBlocksChanged(
    Trigger.isDelete ? Trigger.old : Trigger.new
  );
}
