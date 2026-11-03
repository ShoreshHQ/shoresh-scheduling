trigger ActivityTrigger on Activity__c(
  before delete,
  before insert,
  before update
) {
  if (Trigger.isDelete && Trigger.isBefore) {
    WeekExceptions.goWith(Trigger.oldMap.keySet());
    return;
  }
  ActivityTriggerHandler.beforeSave(Trigger.new, Trigger.oldMap);
}
