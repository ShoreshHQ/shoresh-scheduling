trigger ElectiveSetTrigger on ElectiveSet__c(
  before insert,
  before update,
  before delete
) {
  ElectiveSetupTriggers.handleSets(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
