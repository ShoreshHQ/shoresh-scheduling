trigger ActivityLeaderTrigger on ActivityLeader__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  ActivityLeaderTriggerHandler.beforeSave(Trigger.new);
}
