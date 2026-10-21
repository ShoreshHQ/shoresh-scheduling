trigger PlanPartTrigger on PlanPart__c(before insert, before update) {
  PlanPartTriggerHandler.beforeSave(Trigger.new);
}
