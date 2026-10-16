trigger WeekExceptionTrigger on WeekException__c(before insert, before update) {
  WeekExceptionTriggerHandler.beforeSave(Trigger.new);
}
