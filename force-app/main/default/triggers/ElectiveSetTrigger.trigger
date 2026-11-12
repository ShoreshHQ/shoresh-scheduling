trigger ElectiveSetTrigger on ElectiveSet__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  ElectiveSetupTriggers.handleSets(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
