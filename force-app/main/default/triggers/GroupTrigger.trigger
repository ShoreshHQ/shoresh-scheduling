trigger GroupTrigger on Group__c(after insert, after update) {
  SetTimeTriggers.groupsSaved(Trigger.new, Trigger.oldMap);
}
