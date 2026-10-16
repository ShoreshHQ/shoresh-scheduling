trigger CampLabelTrigger on CampLabel__c(before insert, before update) {
  CampLabelTriggerHandler.beforeSave(Trigger.new);
}
