trigger WeekTrigger on Week__c(
  before insert,
  before update,
  before delete,
  after insert,
  after undelete
) {
  WeekTriggerHandler.handle(Trigger.operationType, Trigger.new, Trigger.oldMap);
}
