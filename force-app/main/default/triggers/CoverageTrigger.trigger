trigger CoverageTrigger on Coverage__c(
  before insert,
  before update,
  after insert,
  after update,
  after delete
) {
  CoverageTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.old
  );
}
