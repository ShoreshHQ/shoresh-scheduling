trigger OfferingTrigger on Offering__c(before insert, before update) {
  ElectiveSetupTriggers.offeringsSaving(Trigger.new);
}
