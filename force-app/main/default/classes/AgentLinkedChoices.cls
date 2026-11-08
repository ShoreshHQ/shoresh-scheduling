/**
 * read_linked_choices: what the linked choices editor beside the Electives list reads, through an
 * agent or the command line (docs/protocol/api.md API-1.131). Web address /v1/linked_choices, GET
 * ?season=&elective_set=: the set, the season's setup, the camp's words and where the set sits
 * (LinkedChoicePlaces), for the connector to work out with the editor's own module
 * (c/shoreshElectiveDetails linkedChoices.js) what the editor shows and marks.
 */
@RestResource(urlMapping='/v1/linked_choices')
global with sharing class AgentLinkedChoices {
  @HttpGet
  global static void get() {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      Map<String, Object> asked = new Map<String, Object>();
      for (String field : new List<String>{ 'season', 'elective_set' }) {
        asked.put(field, RestContext.request.params.get(field));
      }
      AgentLinkedChoiceRefs refs = new AgentLinkedChoiceRefs(asked);
      // Where it sits first: its reading is the heaviest, so nothing else is held meanwhile.
      LinkedChoicePlaces.Places places = refs.places();
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(
        OutgoingRows.said(
          new Map<String, Object>{
            'elective_set' => refs.electiveSet.Name,
            'set_id' => refs.electiveSet.Id,
            'setup' => SeasonSetupController.getSeasonSetup(refs.season.Id),
            'labels' => refs.labels.all(),
            'places' => places
          }
        )
      );
    } catch (Exception e) {
      Boolean ours =
        e instanceof ShoreshException || e instanceof AuraHandledException;
      response.statusCode = ours ? 400 : 500;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          OutgoingRows.answered(
            ours ? e.getMessage() : ScreenErrors.loadingWords(e)
          )
        )
      );
    }
  }
}
