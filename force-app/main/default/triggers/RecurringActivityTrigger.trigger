trigger RecurringActivityTrigger on RecurringActivity__c(
  before insert,
  before update,
  after insert,
  after update,
  after undelete
) {
  SetTimeItemTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    'RecurringActivity'
  );
}
