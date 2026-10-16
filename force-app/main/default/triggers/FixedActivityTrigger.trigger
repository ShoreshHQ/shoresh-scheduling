trigger FixedActivityTrigger on FixedActivity__c(
  before insert,
  before update,
  after insert,
  after update
) {
  if (Trigger.isBefore) {
    SetTimeItemTriggerHandler.beforeSave(Trigger.new, 'FixedActivity');
  } else {
    SetTimeTriggers.itemsSaved(Trigger.new);
  }
}
