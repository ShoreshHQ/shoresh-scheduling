trigger CoverageTrigger on Coverage__c(
  before insert,
  before update,
  after insert,
  after update,
  after delete
) {
  if (Trigger.isBefore) {
    CoverageTriggerHandler.beforeSave(Trigger.new);
  } else {
    SetTimeTriggers.coverageChanged(
      Trigger.isDelete ? Trigger.old : Trigger.new
    );
  }
}
