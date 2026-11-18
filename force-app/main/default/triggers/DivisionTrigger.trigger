trigger DivisionTrigger on Division__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  FormerNames.noteRenames(Division__c.FormerNames__c);
}
