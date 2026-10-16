trigger TimeBlockTrigger on TimeBlock__c(
  after insert,
  after update,
  after delete,
  after undelete
) {
  SetTimeTriggers.timeBlocksChanged(
    Trigger.isDelete ? Trigger.old : Trigger.new
  );
}
