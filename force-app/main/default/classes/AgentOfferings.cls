/**
 * read_offerings: what the Electives list's rows read, through an agent or the command line
 * (docs/protocol/api.md API-1.135). Web address /v1/offerings, GET ?season=&elective_set=: the set,
 * the season's setup and the camp's words, for the connector to work out with the list's own module
 * (c/shoreshElectiveDetails offerings.js) what each row holds and marks.
 */
@RestResource(urlMapping='/v1/offerings')
global with sharing class AgentOfferings {
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
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(
        OutgoingRows.said(
          new Map<String, Object>{
            'elective_set' => refs.electiveSet.Name,
            'set_id' => refs.electiveSet.Id,
            'setup' => SeasonSetupController.getSeasonSetup(refs.season.Id),
            'labels' => refs.labels.all()
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
