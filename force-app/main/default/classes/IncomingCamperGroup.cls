/**
 * camper_group: which bunk each camper is in, which weeks (docs/protocol/api.md; repo ADR 0024).
 * Web address /v1/camper_group and the Flow action "camper_group": one piece of logic
 * (IncomingBatch).
 *
 * Shoresh keeps a camper's bunk with their elective choices for each week (Preference__c), so a
 * bunk is set on the camper's choices in the week named, or in every week with no week named. A
 * bunk belongs to the other system (API-4.2): it is changed only here, inside the save. Seats
 * already final are not changed.
 */
@RestResource(urlMapping='/v1/camper_group')
global with sharing class IncomingCamperGroup implements IncomingBatch.Capability {
  // The record's fields by their plain names (API-1.5), for the web address.
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'source_system',
    'camper_id',
    'camper_name',
    'bunk',
    'week'
  };

  /** One camper's bunk as the other system has it. */
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
      label='camper_id'
      description='The camper\'s ID in the sending system.'
    )
    global String camper_id;
    @InvocableVariable(
      label='camper_name'
      description='The camper\'s name, when there is no ID.'
    )
    global String camper_name;
    @InvocableVariable(
      label='bunk'
      description='The name of the camper\'s bunk (group) in Shoresh.'
      required=true
    )
    global String bunk;
    @InvocableVariable(
      label='week'
      description='The week\'s name in Shoresh, like Week 1. Leave it out for every week.'
    )
    global String week;
  }

  @InvocableMethod(
    label='camper_group'
    description='Say which bunk each camper is in, for one week or every week.'
    category='Shoresh'
  )
  global static List<IncomingResult> camperGroup(List<Record> records) {
    return IncomingDoors.byFlow(new IncomingCamperGroup(), records);
  }

  @HttpPost
  global static void post() {
    IncomingDoors.byWeb(new IncomingCamperGroup(), Record.class, FIELDS);
  }

  // ---------------------------------------------------------------- the capability

  public String permissionSet() {
    return 'Send_Camper_Groups';
  }
  public String permissionLabel() {
    return 'Send camper groups';
  }
  public String what() {
    return 'Camper groups';
  }
  public String seasonOf(Object record) {
    return ((Record) record).season;
  }
  public String systemOf(Object record) {
    return ((Record) record).source_system;
  }

  public void plan(IncomingBatch batch, List<Object> records) {
    new IncomingCamperGroupPlan(batch).plan(records);
  }
}
