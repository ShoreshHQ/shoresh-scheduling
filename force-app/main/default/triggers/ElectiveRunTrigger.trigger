trigger ElectiveRunTrigger on ElectiveRun__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  ElectiveRunTriggers.runsSaving(Trigger.new);
}
