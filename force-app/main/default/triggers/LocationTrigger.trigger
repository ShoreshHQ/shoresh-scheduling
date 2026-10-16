trigger LocationTrigger on Location__c(
  before insert,
  before update,
  after update
) {
  if (Trigger.isBefore) {
    LocationTriggerHandler.beforeSave(Trigger.new);
  } else {
    SetTimeTriggers.locationsSaved(Trigger.new, Trigger.oldMap);
  }
}
