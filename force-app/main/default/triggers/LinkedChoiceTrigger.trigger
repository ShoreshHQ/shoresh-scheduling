trigger LinkedChoiceTrigger on LinkedChoice__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  LinkedChoiceTriggers.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
