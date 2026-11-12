trigger SeasonTrigger on Season__c(
  before update,
  before delete,
  after insert,
  after update,
  after delete,
  after undelete
) {
  SeasonTriggerHandler.handle(
    Trigger.operationType,
    Trigger.new,
    Trigger.oldMap
  );
}
