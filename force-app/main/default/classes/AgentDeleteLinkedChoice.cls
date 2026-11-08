/**
 * delete_linked_choice: delete a linked choice, as Delete in the linked choices editor does,
 * through an agent or the command line (docs/protocol/api.md API-1.134). Web address
 * /v1/delete_linked_choice, POST {season, elective_set, activity, name}. It is the setup screens'
 * own delete, as the editor's is (SetupDelete): it asks first with the screen's question, says
 * what goes with it, and refuses what the screen refuses, with nothing deleted.
 */
@RestResource(urlMapping='/v1/delete_linked_choice')
global with sharing class AgentDeleteLinkedChoice implements AgentWeeks.Action, AgentAskFirst.Preview {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'elective_set',
    'activity',
    'name'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentDeleteLinkedChoice());
  }

  /** The screen's own question before its Delete (API-1.106). */
  public String preview() {
    AgentSetupRecords.Found found = found();
    // The very record shown: one made since under the same name is another delete.
    AgentAskFirst.stateIs(found.id);
    return AgentDeleteSetup.question(found);
  }

  public String run() {
    return AgentDeleteSetup.removed(found());
  }

  private static AgentSetupRecords.Found found() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    LinkedChoice__c choice = new AgentLinkedChoiceRefs(body).choiceOf(body);
    AgentSetupRecords.Found found = new AgentSetupRecords.Found();
    found.id = choice.Id;
    found.name = choice.Name;
    return found;
  }
}
