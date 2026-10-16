trigger RecurringActivityTrigger on RecurringActivity__c(
  before insert,
  before update,
  after insert,
  after update
) {
  if (Trigger.isBefore) {
    SetTimeItemTriggerHandler.beforeSave(Trigger.new, 'RecurringActivity');
  } else {
    SetTimeTriggers.itemsSaved(Trigger.new);
  }
}
