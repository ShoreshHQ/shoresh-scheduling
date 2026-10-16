trigger SeasonTrigger on Season__c(before delete) {
  SeasonTriggerHandler.beforeDelete(Trigger.oldMap);
}
