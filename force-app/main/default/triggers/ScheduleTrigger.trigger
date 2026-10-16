trigger ScheduleTrigger on Schedule__c(before insert, before update) {
  ScheduleTriggerHandler.beforeSave(Trigger.new);
}
