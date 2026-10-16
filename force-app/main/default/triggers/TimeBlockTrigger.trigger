trigger TimeBlockTrigger on TimeBlock__c(
  after insert,
  after update,
  after delete
) {
  SetTimeTriggers.timeBlocksChanged(
    Trigger.isDelete ? Trigger.old : Trigger.new
  );
}
