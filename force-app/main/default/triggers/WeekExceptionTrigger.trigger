trigger WeekExceptionTrigger on WeekException__c(
  before insert,
  before update,
  after delete
) {
  if (Trigger.isDelete) {
    SetTimeTriggers.weekExceptionsRemoved(Trigger.old);
  } else {
    WeekExceptionTriggerHandler.beforeSave(Trigger.new);
  }
}
