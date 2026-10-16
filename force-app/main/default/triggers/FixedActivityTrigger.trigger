trigger FixedActivityTrigger on FixedActivity__c(
  before insert,
  before update,
  after insert,
  after update
) {
  SetTimeItemTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    'FixedActivity'
  );
}
