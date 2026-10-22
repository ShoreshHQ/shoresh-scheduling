trigger ElectiveSetTrigger on ElectiveSet__c(
  before insert,
  before update,
  before delete
) {
  if (Trigger.isDelete) {
    ElectiveSetupTriggers.setsDeleting(Trigger.oldMap);
  } else {
    ElectiveSetupTriggers.setsSaving(Trigger.new);
  }
}
