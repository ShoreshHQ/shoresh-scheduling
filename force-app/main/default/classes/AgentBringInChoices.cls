/**
 * bring_in_choices: the Elective seats screen's own Bring in choices, through an agent or the
 * command line (docs/protocol/api.md API-1.117), so an AI can start a week's electives as a person
 * does. Web address /v1/bring_in_choices. GET ?season= is what the screen reads before a file (the
 * season's setup, its remembered answers, and the screen's own sets and runs, AgentImports); the
 * connector reads the file and works the request out with the screen's own modules
 * (c/shoreshChoicesReader, c/shoreshChoicesImport review.js). POST {season, request} is the
 * screen's own check (ChoicesImportController.checkChoices: what it would bring in, nothing saved);
 * with save: true it is the screen's own Bring in (bringInChoices), all or nothing. Nothing is
 * taken away (a camper's choices made by hand are kept), so it doesn't ask first.
 */
@RestResource(urlMapping='/v1/bring_in_choices')
global with sharing class AgentBringInChoices implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'request',
    'save'
  };

  @HttpGet
  global static void get() {
    AgentImports.answerRead(AgentImports.CHOICES);
  }

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentBringInChoices());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(body, 'season')
    );
    Object given = body.get('request');
    if (!(given instanceof Map<String, Object>)) {
      throw new ShoreshException('Send the request the review gave (request).');
    }
    Map<String, Object> request = (Map<String, Object>) given;
    if (String.valueOf(request.get('seasonId')) != String.valueOf(season.Id)) {
      throw new ShoreshException('That request is for another season.');
    }
    Boolean save = body.get('save') == true;
    try {
      return save
        ? JSON.serialize(
            ChoicesImportController.bringInChoices(JSON.serialize(request))
          )
        : JSON.serialize(
            ChoicesImportController.checkChoices(JSON.serialize(request))
          );
    } catch (Exception e) {
      // The screen's own words for each (shoreshChoicesImport save and runCheck).
      throw new ShoreshException(
        (save
          ? 'Nothing was brought in. '
          : 'Couldn\'t count what this sheet brings in. ') +
        ScreenErrors.words(e)
      );
    }
  }
}
