/**
 * read_activity_details: what an activity's details panel holds (who can do it, who leads it, when it runs, same
 * division only, early in the week, notes), as the person sees them, through an agent or the command line
 * (docs/protocol/api.md API-1.51). Web address /v1/read_activity_details, GET ?season=&name=. Each
 * value is said as change_activity_details takes it back as seen.
 */
@RestResource(urlMapping='/v1/read_activity_details')
global with sharing class AgentReadActivityRules implements AgentRequest.SentenceRead {
  @HttpGet
  global static void get() {
    AgentRequest.answer(new AgentReadActivityRules());
  }

  public Set<String> fields() {
    return new Set<String>{ 'season', 'name' };
  }

  public String run(Map<String, Object> asked) {
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
