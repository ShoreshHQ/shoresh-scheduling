/**
 * read_electives_list: what the Electives list's rows read, through an agent or the command line
 * (docs/protocol/api.md API-1.135). Web address /v1/electives_list, GET ?season=&elective_set=: the set,
 * the season's setup and the camp's words, for the connector to work out with the list's own module
 * (c/shoreshElectiveDetails offerings.js) what each row holds and marks.
 */
@RestResource(urlMapping='/v1/electives_list')
global with sharing class AgentOfferings implements AgentRequest.Read {
  @HttpGet
  global static void get() {
    AgentRequest.answer(new AgentOfferings());
  }

  public Set<String> fields() {
    return new Set<String>{ 'season', 'elective_set' };
  }

  public String run(Map<String, Object> asked) {
    AgentLinkedChoiceRefs refs = new AgentLinkedChoiceRefs(asked);
    return JSON.serialize(
      new Map<String, Object>{
        'elective_set' => refs.electiveSet.Name,
        'set_id' => refs.electiveSet.Id,
        'setup' => SeasonSetupController.getSeasonSetup(refs.season.Id),
        'labels' => refs.labels.all()
      },
      true
    );
  }
}
