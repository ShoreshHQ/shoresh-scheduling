trigger ActivityEligibilityTrigger on ActivityEligibility__c(
  before insert,
  before update
) {
  ActivityEligibilityTriggerHandler.beforeSave(Trigger.new);
}
