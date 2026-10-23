trigger AssignmentTrigger on Assignment__c(before insert, before update) {
  ElectiveRunTriggers.assignmentsSaving(Trigger.new);
}
