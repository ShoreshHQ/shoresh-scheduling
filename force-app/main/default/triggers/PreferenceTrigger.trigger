trigger PreferenceTrigger on Preference__c(before insert, before update) {
  ElectiveRunTriggers.preferencesSaving(Trigger.new);
  OutsideOwned.preferencesSaving(Trigger.new, Trigger.oldMap);
}
