trigger WeekTrigger on Week__c(
  before insert,
  before update,
  before delete,
  after insert
) {
  if (Trigger.isAfter) {
    SetTimeTriggers.weeksAdded(Trigger.new);
  } else {
    WeekTriggerHandler.handle(
      Trigger.operationType,
      Trigger.new,
      Trigger.oldMap
    );
  }
}
