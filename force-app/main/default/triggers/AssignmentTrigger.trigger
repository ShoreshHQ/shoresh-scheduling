trigger AssignmentTrigger on Assignment__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  ElectiveRunTriggers.assignmentsSaving(Trigger.new);
}
