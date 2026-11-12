trigger FixedActivityTrigger on FixedActivity__c(
  before insert,
  before update,
  before delete,
  after insert,
  after update,
  after undelete
) {
  ArchivedSeasons.refuseChanges();
  SetTimeItemTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    'FixedActivity'
  );
}
