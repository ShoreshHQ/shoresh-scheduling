trigger ActivityOffTimeTrigger on ActivityOffTime__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  ActivityOffTimeTriggerHandler.beforeSave(Trigger.new);
}
