/**
 * "What Shoresh has learned" (c/shoreshLearned, LearnedController) through an agent or the command
 * line (docs/protocol/api.md API-1.93 to API-1.97). The screen's list is worked out where the
 * screen works it out, outside Salesforce (the connector runs c/shoreshLearned history.js), so
 * the read answers what the screen reads, as JSON:
 *   GET /v1/read_learned_answers?season=  the season's setup (the camp's words and names), the
 *       camp's remembered answers (LearnedController.getLearned) and their history
 *       (getLearnedHistory).
 * Each change is the screen's own (LearnedController), done only while what the AI read is still
 * so, with the answer's record locked (FOR UPDATE, user mode); otherwise refused (409), nothing
 * changed. The four POSTs (AgentChangeLearned, AgentForgetLearned, AgentForgetPattern,
 * AgentUndoLearned) share what is here.
 */
@RestResource(urlMapping='/v1/read_learned_answers')
global with sharing class AgentLearned {
  public static final String NOTHING = ' Nothing was changed.';
  public static final String READ_AGAIN = ' Read them again with read_learned_answers.';
  public static final String PATTERN = 'pattern|';

  @HttpGet
  global static void get() {
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
        JSON.serialize(
          new Map<String, Object>{
            'season' => season.Name,
            'camp' => season.Camp__r.Name,
            'setup' => SeasonSetupController.getSeasonSetupInCamp(
              season.Camp__c,
              season.Id
            ),
            'answers' => LearnedController.getLearned(season.Camp__c),
            'events' => LearnedController.getLearnedHistory(season.Camp__c)
          },
          true
        )
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

  /** The camp of the season named (none: the season the screens open on). */
  public static Id campOf(Map<String, Object> body) {
    return AgentChangeCampWords.seasonOf(AgentFields.text(body, 'season'))
      .Camp__c;
  }

  /**
   * The camp's answer named (answer_id), locked, while its answer is still the one read (seen,
   * capitals and all); otherwise refused (409).
   */
  public static ImportAnswer__c locked(Id campId, Map<String, Object> body) {
    Id answerId;
    try {
      answerId = Id.valueOf(raw(body, 'answer_id'));
    } catch (Exception e) {
      throw new ShoreshException(
        'Say the answer as read_learned_answers names it (answer_id).' + NOTHING
      );
    }
    String seen = seenOf(body);
    List<ImportAnswer__c> rows = [
      SELECT Id, QuestionKey__c, Answer__c
      FROM ImportAnswer__c
      WHERE Id = :answerId AND Camp__c = :campId
      WITH USER_MODE
      LIMIT 1
      FOR UPDATE
    ];
    // "Tuesday" is what was read; capitals count (Apex's == ignores case).
    if (rows.isEmpty() || !seen.equals(rows[0].Answer__c)) {
      throw stale();
    }
    return rows[0];
  }

  public static String seenOf(Map<String, Object> body) {
    if (!body.containsKey('seen') || body.get('seen') == null) {
      throw new ShoreshException(
        'Say what read_learned_answers gave as seen, so a change someone made since isn\'t replaced unseen.' +
        NOTHING
      );
    }
    return String.valueOf(body.get('seen'));
  }

  /** A field as sent, spaces kept (a pattern's name is as the camp wrote it). */
  public static String raw(Map<String, Object> body, String field) {
    Object value = body.get(field);
    return value == null ? '' : String.valueOf(value);
  }

  public static AgentWeeks.ConflictException stale() {
    return new AgentWeeks.ConflictException(
      'Someone changed or forgot that answer since you read it, so nothing was changed.' +
      READ_AGAIN
    );
  }

  /** A refusal from the screen's own action, in its words: nothing was changed. */
  public static ShoreshException refused(Exception e) {
    return new ShoreshException(ScreenErrors.words(e) + NOTHING);
  }
}
