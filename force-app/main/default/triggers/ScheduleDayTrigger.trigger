trigger ScheduleDayTrigger on ScheduleDay__c(
  before insert,
  before update,
  before delete
) {
  PublishedGuard.checkDays(Trigger.isDelete ? Trigger.old : Trigger.new);
}
