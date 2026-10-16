trigger LocationTrigger on Location__c(before insert, before update) {
  LocationTriggerHandler.beforeSave(Trigger.new);
}
