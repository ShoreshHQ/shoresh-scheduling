trigger ScheduleDayTrigger on ScheduleDay__c(
  before insert,
  before update,
  before delete,
  after insert,
  after update,
  after delete
) {
  if (Trigger.isBefore) {
    PublishedGuard.checkDays(Trigger.isDelete ? Trigger.old : Trigger.new);
  } else {
    // A special event's days follow the drafts that hold it (ADR 0014 slice 4).
    SpecialEventDays.afterDays(
      Trigger.isDelete ? null : Trigger.new,
      Trigger.isInsert ? null : Trigger.old
    );
  }
}
