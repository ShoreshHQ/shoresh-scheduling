trigger SpecialDateTrigger on SpecialDate__c(
  before insert,
  before update,
  before delete
) {
  ArchivedSeasons.refuseChanges();
  SpecialDateTriggerHandler.beforeChange(Trigger.new);
}
