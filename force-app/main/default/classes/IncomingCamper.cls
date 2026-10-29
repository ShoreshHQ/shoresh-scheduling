/**
 * camper: campers from the camp's other system (docs/protocol/api.md; repo ADR 0024). Web address
 * /v1/camper and the Flow action "camper": one piece of logic (IncomingBatch).
 *
 * - API-2.1, 2.2: found by the system and its ID, else as the import finds them (IncomingCampers);
 *   a doubt is a question for a person, never a guess.
 * - API-2.4: a name fixed in the other system updates the same camper; Shoresh's IDs never change.
 * - API-4.3: nothing is deleted from outside. withdrawn: true keeps the camper, hidden from seats.
 * - API-2.5: the same record again changes nothing; changed_at older than the last one taken
 *   for that camper is ignored, and said.
 */
@RestResource(urlMapping='/v1/camper')
global with sharing class IncomingCamper implements IncomingBatch.Capability {
  // The record's fields by their plain names (API-1.5), for the web address.
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'source_system',
    'camper_id',
    'camper_name',
    'camper_number',
    'withdrawn',
    'changed_at'
  };

  /** One camper as the other system has them. */
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
    @InvocableVariable(label='camper_name' description='The camper\'s name.')
    global String camper_name;
    @InvocableVariable(
      label='camper_number'
      description='The camp\'s own number for the camper, if it has one.'
    )
    global String camper_number;
    @InvocableVariable(
      label='withdrawn'
      description='true when the camper has withdrawn: kept in Shoresh, left out of elective seats.'
    )
    global Boolean withdrawn;
    @InvocableVariable(
      label='changed_at'
      description='When the sending system last changed this camper. An older change sent later is ignored.'
    )
    global Datetime changed_at;
  }

  @InvocableMethod(
    label='camper'
    description='Add campers from another system, or update their names, numbers and whether they have withdrawn. Nothing is deleted.'
    category='Shoresh'
  )
  global static List<IncomingResult> camper(List<Record> records) {
    return IncomingDoors.byFlow(new IncomingCamper(), records);
  }

  @HttpPost
  global static void post() {
    IncomingDoors.byWeb(new IncomingCamper(), Record.class, FIELDS);
  }

  // ---------------------------------------------------------------- the capability

  public String permissionSet() {
    return 'Send_Campers';
  }
  public String permissionLabel() {
    return 'Send campers';
  }
  public String what() {
    return 'Campers';
  }
  public String seasonOf(Object record) {
    return ((Record) record).season;
  }
  public String systemOf(Object record) {
    return ((Record) record).source_system;
  }

  public void plan(IncomingBatch batch, List<Object> records) {
    new IncomingCamperPlan(batch).plan(records);
  }
}
