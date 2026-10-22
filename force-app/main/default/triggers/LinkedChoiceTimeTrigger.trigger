trigger LinkedChoiceTimeTrigger on LinkedChoiceTime__c(
  before insert,
  before update
) {
  ElectiveSetupTriggers.linkedChoiceTimesSaving(Trigger.new);
}
