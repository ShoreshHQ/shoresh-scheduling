/**
 * Import a list and Import worksheet through an agent or the command line (docs/protocol/api.md
 * API-1.80, API-1.81). The file is read where the screen reads it, outside Salesforce (the
 * connector runs the screen's own module, c/shoreshLists), so each web address has two halves:
 *   GET  ?season=  what the screen reads: the season's setup (SeasonSetupController.
 *        getSeasonSetupInCamp, the camp's words in it), the camp's remembered answers
 *        (ImportController.getAnswers), and the setup's stamp as read (seen)
 *   POST {season, seen, plan}  the screen's own save (ImportController.saveList or saveWorkbook),
 *        made only while the season's setup still has the stamp seen, compared with the season
 *        locked as imports and Undos lock it (ImportUndo.lockSeason)
 */
public with sharing class AgentImports {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'seen',
    'plan'
  };

  /** What the screen reads before a file, answered as JSON (refusals as {"message"}). */
  public static void answerRead() {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      for (String key : RestContext.request.params.keySet()) {
        if (key != 'season') {
          throw new ShoreshException(
            'Shoresh doesn\'t know the field "' +
              key.left(40) +
              '". The fields are: season.'
          );
        }
      }
      Season__c season = AgentChangeCampWords.seasonOf(
        RestContext.request.params.get('season')
      );
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(
        JSON.serialize(readOf(season), true)
      );
    } catch (Exception e) {
      Boolean ours =
        e instanceof ShoreshException || e instanceof AuraHandledException;
      response.statusCode = ours ? 400 : 500;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, String>{
            'message' => ours ? e.getMessage() : ScreenErrors.loadingWords(e)
          }
        )
      );
    }
  }

  /** The screen's own reads, and the stamp a save carries back as seen. */
  public static Map<String, Object> readOf(Season__c season) {
    return new Map<String, Object>{
      'season' => season.Name,
      'setup' => SeasonSetupController.getSeasonSetupInCamp(
        season.Camp__c,
        season.Id
      ),
      'answers' => ImportController.getAnswers(season.Camp__c),
      'seen' => AgentImportStamp.of(season.Id, season.Camp__c)
    };
  }

  /** Import a list's own save (ImportController.saveList), only while the setup is as read. */
  public static String saveList() {
    String plan = checkedPlan();
    try {
      return JSON.serialize(ImportController.saveList(plan), true);
    } catch (Exception e) {
      throw nothingSaved(e);
    }
  }

  /** Import worksheet's own save (ImportController.saveWorkbook), only while the setup is as read. */
  public static String saveWorkbook() {
    String plan = checkedPlan();
    try {
      return JSON.serialize(ImportController.saveWorkbook(plan), true);
    } catch (Exception e) {
      throw nothingSaved(e);
    }
  }

  private static ShoreshException nothingSaved(Exception e) {
    return new ShoreshException('Nothing was saved. ' + ScreenErrors.words(e));
  }

  /**
   * The plan sent, for the season named, once the season is locked and its setup is still as
   * read (seen); refused otherwise. The answer of a save is its result as JSON, which the
   * connector says in the screen's words.
   */
  private static String checkedPlan() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(body, 'season')
    );
    String seen = AgentFields.text(body, 'seen');
    if (String.isBlank(seen)) {
      throw new ShoreshException(
        'Send the seen the review gave, so a change someone made since isn\'t replaced unseen.'
      );
    }
    // The plan as the connector sent it: never respaced (a name's own spaces are kept).
    Object sent = body.get('plan');
    String plan = sent instanceof String ? (String) sent : null;
    if (planSeason(plan) != season.Id) {
      throw new ShoreshException(
        'The import could not be read. Start it again.'
      );
    }
    // Imports and Undos in one season take turns; the setup is compared once it is ours.
    ImportUndo.lockSeason(season.Id);
    if (AgentImportStamp.of(season.Id, season.Camp__c) != seen) {
      throw new AgentWeeks.ConflictException(
        'Someone changed the setup of "' +
          season.Name +
          '" since the file was reviewed, so nothing was saved. Review the file again.'
      );
    }
    return plan;
  }

  /** The season a plan is for; null when it can't be read. */
  private static Id planSeason(String plan) {
    try {
      Object id = ((Map<String, Object>) JSON.deserializeUntyped(plan))
        .get('seasonId');
      return id instanceof String ? (Id) (String) id : null;
    } catch (Exception e) {
      return null;
    }
  }
}
