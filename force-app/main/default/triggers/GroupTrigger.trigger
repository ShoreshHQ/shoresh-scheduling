trigger GroupTrigger on Group__c(after insert, after update, after undelete) {
  SetTimeTriggers.groupsSaved(Trigger.new, Trigger.oldMap);
}
