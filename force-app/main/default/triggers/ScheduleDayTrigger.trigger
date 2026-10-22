trigger ScheduleDayTrigger on ScheduleDay__c(
  before insert,
  before update,
  before delete,
  after insert,
  after update,
  after delete
) {
  ScheduleDayTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.old
  );
}
