trigger DivisionTrigger on Division__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
}
