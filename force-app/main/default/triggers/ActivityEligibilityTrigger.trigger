trigger ActivityEligibilityTrigger on ActivityEligibility__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  ActivityEligibilityTriggerHandler.beforeSave(Trigger.new);
}
