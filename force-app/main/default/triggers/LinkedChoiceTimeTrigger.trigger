trigger LinkedChoiceTimeTrigger on LinkedChoiceTime__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  LinkedChoiceTriggers.linkedChoiceTimesSaving(Trigger.new);
}
