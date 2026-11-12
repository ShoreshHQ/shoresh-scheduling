trigger CampLabelTrigger on CampLabel__c(
  before insert,
  before update,
  after delete
) {
  CampLabelTriggerHandler.handle(Trigger.operationType, Trigger.new);
}
