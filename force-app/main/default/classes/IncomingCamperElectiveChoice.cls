/**
 * camper_elective_choice: a camper's elective choices, from a form or the camp's other system
 * (docs/protocol/api.md; repo ADR 0024). Web address /v1/camper_elective_choice and the Flow
 * action "camper_elective_choice": one piece of logic (IncomingBatch).
 *
 * Stored as the choices sheet stores them (ChoicesImport.SheetChoice: ranked, by the name as
 * written and the activity it is), so a camper's choices read the same however they came in.
 *
 * - API-4.1: choices a person changed in Shoresh are kept; the incoming ones are kept beside them
 *   (ImportedChoices__c) and a person is asked on Roots.
 * - API-2.5: the same choices again change nothing; changed_at older than the last taken for
 *   those choices is ignored, and said.
 * - Final seats are never changed from outside.
 */
@RestResource(urlMapping='/v1/camper_elective_choice')
global with sharing class IncomingCamperElectiveChoice implements IncomingBatch.Capability {
  // The record's fields by their plain names (API-1.5), for the web address.
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'source_system',
    'camper_id',
    'camper_name',
    'elective',
    'week',
    'first_choice',
    'second_choice',
    'third_choice',
    'fourth_choice',
    'fifth_choice',
    'changed_at'
  };

  /** One camper's choices for one elective in one week. */
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
      label='elective'
      description='The elective set\'s name in Shoresh, like Chugim.'
      required=true
    )
    global String elective;
    @InvocableVariable(
      label='week'
      description='The week\'s name in Shoresh, like Week 1.'
      required=true
    )
    global String week;
    @InvocableVariable(
      label='first_choice'
      description='The activity the camper wants most, by its name in Shoresh.'
    )
    global String first_choice;
    @InvocableVariable(label='second_choice' description='The next one.')
    global String second_choice;
    @InvocableVariable(label='third_choice' description='The next one.')
    global String third_choice;
    @InvocableVariable(label='fourth_choice' description='The next one.')
    global String fourth_choice;
    @InvocableVariable(label='fifth_choice' description='The next one.')
    global String fifth_choice;
    @InvocableVariable(
      label='changed_at'
      description='When the camper last changed these choices. An older change sent later is ignored.'
    )
    global Datetime changed_at;

    List<String> choices() {
      List<String> named = new List<String>();
      for (
        String choice : new List<String>{
          first_choice,
          second_choice,
          third_choice,
          fourth_choice,
          fifth_choice
        }
      ) {
        if (String.isNotBlank(choice)) {
          named.add(choice.trim());
        }
      }
      return named;
    }
  }

  @InvocableMethod(
    label='camper_elective_choice'
    description='Bring in each camper\'s elective choices, first choice first. Choices a person changed in Shoresh are kept.'
    category='Shoresh'
  )
  global static List<IncomingResult> camperElectiveChoice(
    List<Record> records
  ) {
    return IncomingDoors.byFlow(new IncomingCamperElectiveChoice(), records);
  }

  @HttpPost
  global static void post() {
    IncomingDoors.byWeb(
      new IncomingCamperElectiveChoice(),
      Record.class,
      FIELDS
    );
  }

  // ---------------------------------------------------------------- the capability

  public String permissionSet() {
    return 'Send_Elective_Choices';
  }
  public String permissionLabel() {
    return 'Send elective choices';
  }
  public String what() {
    return 'Elective choices';
  }
  public String seasonOf(Object record) {
    return ((Record) record).season;
  }
  public String systemOf(Object record) {
    return ((Record) record).source_system;
  }

  public void plan(IncomingBatch batch, List<Object> records) {
    new IncomingElectiveChoicePlan(batch).plan(records);
  }
}
