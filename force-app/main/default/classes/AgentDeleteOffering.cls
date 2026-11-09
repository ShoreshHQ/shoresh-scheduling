/**
 * delete_offering: delete a row of the Electives list, as its Delete does, through an agent or the
 * command line (docs/protocol/api.md API-1.137). Web address /v1/delete_offering, POST {season,
 * elective_set, activity}. It is the setup screens' own delete (SetupDelete): it asks first with
 * the screen's question and refuses what the screen refuses, with nothing deleted. The activity is
 * kept; the offering's linked choices go with it.
 */
@RestResource(urlMapping='/v1/delete_offering')
global with sharing class AgentDeleteOffering implements AgentWeeks.Action, AgentAskFirst.Preview {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'elective_set',
    'activity'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentDeleteOffering());
  }

  /** The screen's own question before its Delete (API-1.106). */
  public String preview() {
    AgentSetupRecords.Found found = found();
    // The very row shown: one made since for the same activity is another delete.
    AgentAskFirst.stateIs(found.id);
    return AgentDeleteSetup.question(found);
  }

  public String run() {
    return AgentDeleteSetup.removed(found());
  }

  private static AgentSetupRecords.Found found() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    Offering__c offering = new AgentLinkedChoiceRefs(body)
      .offeringOf(AgentFields.text(body, 'activity'));
    AgentSetupRecords.Found found = new AgentSetupRecords.Found();
    found.id = offering.Id;
    found.name = offering.Activity__r.Name;
    return found;
  }
}
