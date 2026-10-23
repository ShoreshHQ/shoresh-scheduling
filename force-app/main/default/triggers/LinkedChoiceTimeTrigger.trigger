trigger LinkedChoiceTimeTrigger on LinkedChoiceTime__c(
  before insert,
  before update
) {
  LinkedChoiceTriggers.linkedChoiceTimesSaving(Trigger.new);
}
