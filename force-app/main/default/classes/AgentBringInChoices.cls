/**
 * import_choices: the Elective seats screen's own Import choices, through an agent or the
 * command line (docs/protocol/api.md API-1.117), so an AI can start a week's electives as a person
 * does. Web address /v1/import_choices. GET ?season= is what the screen reads before a file (the
 * season's setup, its remembered answers, and the screen's own sets and runs, AgentImports); the
 * connector reads the file and works the request out with the screen's own modules
 * (c/shoreshChoicesReader, c/shoreshChoicesImport review.js). POST {season, request} is the
 * screen's own check (ChoicesImportController.checkChoices: what it would import, nothing saved);
 * with save: true it is the screen's own Import (bringInChoices), all or nothing. Nothing is
 * taken away (a camper's choices made by hand are kept), so it doesn't ask first.
 */
@RestResource(urlMapping='/v1/import_choices')
global with sharing class AgentBringInChoices implements AgentRequest.Change {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'request',
    'save'
  };

  @HttpGet
  global static void get() {
    AgentRequest.answer(new AgentImports.Reads(AgentImports.CHOICES));
  }

  @HttpPost
  global static void post() {
    AgentRequest.answer(new AgentBringInChoices());
  }

  public Set<String> fields() {
    return FIELDS;
  }

  public String run(Map<String, Object> body) {
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(body, 'season')
    );
    Object given = body.get('request');
    if (!(given instanceof Map<String, Object>)) {
      throw new ShoreshException(
        'Send back what the review gave, exactly as it gave it (request).'
      );
    }
    Map<String, Object> request = (Map<String, Object>) given;
    if (String.valueOf(request.get('seasonId')) != String.valueOf(season.Id)) {
      throw new ShoreshException('That review is for another season.');
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
          ? 'Nothing was imported. '
          : 'Couldn\'t count what this sheet imports. ') + ScreenErrors.words(e)
      );
    }
  }
}
