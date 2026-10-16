trigger WeekTrigger on Week__c(before insert, before update, before delete) {
  WeekTriggerHandler.handle(Trigger.operationType, Trigger.new, Trigger.oldMap);
}
