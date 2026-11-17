trigger DivisionTrigger on Division__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  if (Trigger.isBefore && Trigger.isUpdate) {
    FormerNames.note(Trigger.new, Trigger.oldMap, Division__c.FormerNames__c);
  }
}
