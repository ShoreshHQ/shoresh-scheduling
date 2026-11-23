trigger CamperTrigger on Camper__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  CamperKeys.fill(Trigger.new);
  OutsideOwned.campersSaving(Trigger.new, Trigger.oldMap);
}
