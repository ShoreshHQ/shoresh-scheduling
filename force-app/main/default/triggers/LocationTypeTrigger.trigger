trigger LocationTypeTrigger on LocationType__c(before insert, before update) {
  LocationTypeTriggerHandler.beforeSave(Trigger.new);
}
