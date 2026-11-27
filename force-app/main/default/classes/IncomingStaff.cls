/**
 * staff: staff from the camp's own system (docs/protocol/api/outside-systems.md; repo ADR 0031
 * piece B1). Web address /v1/staff and the Flow action "staff": one piece of logic (IncomingBatch,
 * IncomingStaffPlan).
 *
 * - API-2.7: found only by the system and its ID, never by name. One Shoresh doesn't have is added
 *   to the season's Staff list; one it has gets the name sent. Nothing else about a person comes in.
 * - API-4.11: that name is then the system's (StaffMemberTriggerHandler); only a batch changes it.
 * - API-4.3: nothing is deleted from outside.
 */
@RestResource(urlMapping='/v1/staff')
global with sharing class IncomingStaff implements IncomingBatch.Capability {
  // The record's fields by their plain names (API-1.5), for the web address.
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'source_system',
    'staff_id',
    'staff_name'
  };

  /** One staff member as the camp's system has them. */
  global class Record {
    @InvocableVariable(
      label='season'
      description='The season\'s name in Shoresh, like Summer 2026.'
      required=true
    )
    global String season;
    @InvocableVariable(
      label='source_system'
      description='The name of the sending system, as the camp calls it, like CampMinder.'
      required=true
    )
    global String source_system;
    @InvocableVariable(
      label='staff_id'
      description='The staff member\'s ID in the sending system.'
      required=true
    )
    global String staff_id;
    @InvocableVariable(
      label='staff_name'
      description='The staff member\'s name.'
    )
    global String staff_name;
  }

  @InvocableMethod(
    label='staff'
    description='Add staff from another system, or update their names. Nothing is deleted.'
    category='Shoresh'
  )
  global static List<IncomingResult> staff(List<Record> records) {
    return IncomingDoors.byFlow(new IncomingStaff(), records);
  }

  @HttpPost
  global static void post() {
    IncomingDoors.byWeb(new IncomingStaff(), Record.class, FIELDS);
  }

  // ---------------------------------------------------------------- the capability

  public String permissionSet() {
    return 'Send_Staff';
  }
  public String permissionLabel() {
    return 'Send staff';
  }
  public String what() {
    return 'Staff';
  }
  public String seasonOf(Object record) {
    return ((Record) record).season;
  }
  public String systemOf(Object record) {
    return ((Record) record).source_system;
  }

  public void plan(IncomingBatch batch, List<Object> records) {
    List<StaffMember__c> sent = new List<StaffMember__c>();
    for (Object item : records) {
      Record record = item == null ? new Record() : (Record) item;
      sent.add(
        new StaffMember__c(
          Season__c = batch.season.Id,
          SourceSystem__c = trimmed(record.source_system),
          OutsideId__c = trimmed(record.staff_id),
          Name = trimmed(record.staff_name)
        )
      );
    }
    new IncomingStaffPlan(batch).plan(sent);
  }

  private static String trimmed(String value) {
    return String.isBlank(value) ? null : value.trim();
  }
}
