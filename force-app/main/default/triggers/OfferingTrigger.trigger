trigger OfferingTrigger on Offering__c(
  before insert,
  before update,
  before delete
) {
  ElectiveSetupTriggers.handleOfferings(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
