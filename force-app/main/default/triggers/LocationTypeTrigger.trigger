trigger LocationTypeTrigger on LocationType__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  LocationTypeTriggerHandler.beforeSave(Trigger.new);
}
