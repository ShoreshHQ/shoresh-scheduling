trigger StaffMemberTrigger on StaffMember__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  StaffMemberTriggerHandler.beforeSave(Trigger.new);
}
