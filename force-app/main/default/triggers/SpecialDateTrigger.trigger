trigger SpecialDateTrigger on SpecialDate__c(
  before insert,
  before update,
  before delete
) {
  SpecialDateTriggerHandler.beforeChange(Trigger.new);
}
