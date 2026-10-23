trigger ElectiveRunTrigger on ElectiveRun__c(before insert, before update) {
  ElectiveRunTriggers.runsSaving(Trigger.new);
}
