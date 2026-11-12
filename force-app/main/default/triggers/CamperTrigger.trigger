trigger CamperTrigger on Camper__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  ElectiveRunTriggers.campersSaving(Trigger.new);
  OutsideOwned.campersSaving(Trigger.new, Trigger.oldMap);
}
