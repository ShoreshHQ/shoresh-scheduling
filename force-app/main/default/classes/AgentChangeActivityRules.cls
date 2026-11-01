/**
 * change_activity_rules: change an activity's details (who can do it, same division only, early
 * in the week, notes), as the person, through an agent or the command line (docs/protocol/api.md
 * API-1.51). Web address /v1/change_activity_rules, POST {season, name, fields, seen}. It is the
 * activity details panel's own save (ActivitiesController.saveActivityDetails), made only while
 * each field changed still holds what read_activity_rules said (seen); someone else's change since
 * is refused (409) with nothing saved.
 */
@RestResource(urlMapping='/v1/change_activity_rules')
global with sharing class AgentChangeActivityRules implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'name',
    'fields',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentChangeActivityRules());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    body.put('kind', 'Activity');
    AgentSetupRecords.Found found = AgentSetupRecords.find(body);
    return AgentActivityRules.change(
      found,
      body.get('fields'),
      body.get('seen')
    );
  }
}
