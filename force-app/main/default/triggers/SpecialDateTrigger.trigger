trigger SpecialDateTrigger on SpecialDate__c(
  before insert,
  before update,
  before delete
) {
  // Where special days are changes where electives sit: a run read again in this request reads
  // them again (ElectiveDays).
  ElectiveDays.forget();
  if (!Trigger.isDelete) {
    SpecialDateTriggerHandler.beforeSave(Trigger.new);
  }
}
