trigger RecurringActivityTrigger on RecurringActivity__c(
  before insert,
  before update,
  after insert,
  after update
) {
  SetTimeItemTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    'RecurringActivity'
  );
}
