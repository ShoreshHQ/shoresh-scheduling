/**
 * read_activity_rules: what an activity's details panel holds (who can do it, same division only,
 * early in the week, notes), as the person sees them, through an agent or the command line
 * (docs/protocol/api.md API-1.51). Web address /v1/read_activity_rules, GET ?season=&name=. Each
 * value is said as change_activity_rules takes it back as seen.
 */
@RestResource(urlMapping='/v1/read_activity_rules')
global with sharing class AgentReadActivityRules implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{ 'season', 'name' };

  @HttpGet
  global static void get() {
    AgentWeeks.answer(new AgentReadActivityRules());
  }

  public String run() {
    Map<String, Object> asked = new Map<String, Object>();
    for (String key : RestContext.request.params.keySet()) {
      if (!FIELDS.contains(key)) {
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            key.left(40) +
            '". The fields are: name, season.'
        );
      }
      asked.put(key, RestContext.request.params.get(key));
    }
    asked.put('kind', 'Activity');
    AgentSetupRecords.Found found = AgentSetupRecords.find(asked);
    Map<String, String> now = AgentActivityRules.now(found.id);
    List<String> said = new List<String>();
    for (String key : AgentActivityRules.names()) {
      said.add(key + ': ' + now.get(key));
    }
    return 'The ' +
      found.kind +
      ' "' +
      found.name +
      '" details hold ' +
      String.join(said, '; ') +
      '. Send these back as seen when changing them.';
  }
}
