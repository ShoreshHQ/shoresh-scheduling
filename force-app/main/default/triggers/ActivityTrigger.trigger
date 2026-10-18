trigger ActivityTrigger on Activity__c(before insert, before update) {
  ActivityTriggerHandler.beforeSave(Trigger.new);
}
