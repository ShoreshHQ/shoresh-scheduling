/**
 * read_linked_choices: what the linked choices editor beside the Electives list reads, through an
 * agent or the command line (docs/protocol/api.md API-1.131). Web address /v1/linked_choices, GET
 * ?season=&elective_set=: the set, the season's setup, the camp's words and where the set sits
 * (LinkedChoicePlaces), for the connector to work out with the editor's own module
 * (c/shoreshElectiveDetails linkedChoices.js) what the editor shows and marks.
 */
@RestResource(urlMapping='/v1/linked_choices')
global with sharing class AgentLinkedChoices implements AgentRequest.Read {
  @HttpGet
  global static void get() {
    AgentRequest.answer(new AgentLinkedChoices());
  }

  public Set<String> fields() {
    return new Set<String>{ 'season', 'elective_set' };
  }

  public String run(Map<String, Object> asked) {
    AgentLinkedChoiceRefs refs = new AgentLinkedChoiceRefs(asked);
    // Where it sits first: its reading is the heaviest, so nothing else is held meanwhile.
    LinkedChoicePlaces.Places places = refs.places();
    return JSON.serialize(
      new Map<String, Object>{
        'elective_set' => refs.electiveSet.Name,
        'set_id' => refs.electiveSet.Id,
        'setup' => SeasonSetupController.getSeasonSetup(refs.season.Id),
        'labels' => refs.labels.all(),
        'places' => places
      },
      true
    );
  }
}
