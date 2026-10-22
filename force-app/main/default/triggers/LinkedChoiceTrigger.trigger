trigger LinkedChoiceTrigger on LinkedChoice__c(
  before insert,
  before update,
  before delete
) {
  if (Trigger.isDelete) {
    ElectiveSetupTriggers.linkedChoicesDeleting(Trigger.oldMap.keySet());
  } else {
    ElectiveSetupTriggers.linkedChoicesSaving(Trigger.new);
  }
}
