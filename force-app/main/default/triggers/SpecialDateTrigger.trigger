trigger SpecialDateTrigger on SpecialDate__c(before insert, before update) {
  SpecialDateTriggerHandler.beforeSave(Trigger.new);
}
