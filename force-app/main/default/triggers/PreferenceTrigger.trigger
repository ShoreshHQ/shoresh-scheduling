trigger PreferenceTrigger on Preference__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  ElectiveRunTriggers.preferencesSaving(Trigger.new);
  OutsideOwned.preferencesSaving(Trigger.new, Trigger.oldMap);
}
