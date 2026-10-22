trigger PublishedPlanTrigger on PublishedPlan__c(
  before insert,
  before update,
  before delete
) {
  PublishedGuard.checkCarried(
    Trigger.operationType == System.TriggerOperation.BEFORE_DELETE
      ? Trigger.old
      : Trigger.new
  );
}
