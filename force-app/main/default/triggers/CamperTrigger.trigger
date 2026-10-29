trigger CamperTrigger on Camper__c(before insert, before update) {
  ElectiveRunTriggers.campersSaving(Trigger.new);
  OutsideOwned.campersSaving(Trigger.new, Trigger.oldMap);
}
