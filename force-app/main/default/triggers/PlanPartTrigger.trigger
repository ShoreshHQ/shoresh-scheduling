trigger PlanPartTrigger on PlanPart__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  PlanPartTriggerHandler.beforeSave(Trigger.new);
}
