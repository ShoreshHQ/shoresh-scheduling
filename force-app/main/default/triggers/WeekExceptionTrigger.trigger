trigger WeekExceptionTrigger on WeekException__c(
  before insert,
  before update,
  before delete,
  after update,
  after delete
) {
  ArchivedSeasons.refuseChanges();
  WeekExceptionTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.old
  );
}
