trigger CampLabelTrigger on CampLabel__c(
  before insert,
  before update,
  after delete
) {
  if (Trigger.isDelete) {
    // Camp words read earlier in this request are out of date now.
    CampLabels.forget();
  } else {
    CampLabelTriggerHandler.beforeSave(Trigger.new);
  }
}
