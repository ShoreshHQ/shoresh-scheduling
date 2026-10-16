trigger WeekExceptionTrigger on WeekException__c(
  before insert,
  before update,
  after update,
  after delete
) {
  WeekExceptionTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.old
  );
}
