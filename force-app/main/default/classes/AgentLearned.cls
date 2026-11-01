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
  private static final String NOTHING = ' Nothing was changed.';
  private static final String READ_AGAIN = ' Read them again with read_learned_answers.';
  private static final String PATTERN = 'pattern|';

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

  /** change_learned_answer: the screen's Change and Save, while the answer is still as seen. */
  public static String change(Map<String, Object> body) {
    Id campId = campOf(body);
    ImportAnswer__c row = locked(campId, body);
    String answer = AgentFields.text(body, 'answer');
    Set<String> choices = LearnedChoices.allowed(row.QuestionKey__c);
    if (choices == null) {
      throw new ShoreshException(
        'That answer can only be forgotten, not changed: the screen offers no Change for it.' +
        NOTHING
      );
    }
    if (!choices.contains(answer)) {
      List<String> said = new List<String>(choices);
      said.sort();
      throw new ShoreshException(
        (String.isBlank(answer)
            ? 'Say the answer to change it to (answer). '
            : '"' + answer.left(40) + '" can\'t be given to this question. ') +
          'It can be: ' +
          String.join(said, ', ') +
          '.' +
          NOTHING
      );
    }
    if (answer.equals(row.Answer__c)) {
      throw new ShoreshException('It is already "' + answer + '".' + NOTHING);
    }
    Id newId;
    try {
      newId = LearnedController.changeLearned(campId, row.Id, answer);
    } catch (Exception e) {
      throw new ShoreshException(ScreenErrors.words(e) + NOTHING);
    }
    if (newId == null) {
      throw stale();
    }
    return 'Changed "' +
      row.Answer__c +
      '" to "' +
      answer +
      '". Shoresh remembers it as changed by you, today. To undo it, use undo_learned_answer with undo "change:' +
      newId +
      ':' +
      row.Id +
      '".';
  }

  /** forget_learned_answer: the screen's Forget on an answer, while it is still as seen. */
  public static String forget(Map<String, Object> body) {
    Id campId = campOf(body);
    ImportAnswer__c row = locked(campId, body);
    if (row.QuestionKey__c.startsWith(PATTERN)) {
      throw new ShoreshException(
        'That is a forgotten pattern\'s mark, not an answer: the screen has no Forget for it.' +
        NOTHING
      );
    }
    Boolean done;
    try {
      done = LearnedController.forgetLearned(campId, row.Id);
    } catch (Exception e) {
      throw new ShoreshException(ScreenErrors.words(e) + NOTHING);
    }
    if (done != true) {
      throw stale();
    }
    return 'Forgot "' +
      row.Answer__c +
      '": the next import asks that question again. To undo it, use undo_learned_answer with undo "forget:' +
      row.Id +
      '".';
  }

  /**
   * forget_learned_pattern: the screen's Forget pattern (its answers stay), while the pattern's
   * mark is as seen: the Id of the mark an earlier Forget left, or "none".
   */
  public static String forgetPattern(Map<String, Object> body) {
    Id campId = campOf(body);
    String ref = raw(body, 'pattern');
    // "pattern:<template>:<antecedent>", as read_learned_answers names it.
    List<String> parts = ref.split(':', 3);
    if (parts.size() != 3 || parts[0] != 'pattern') {
      throw new ShoreshException(
        'Say the pattern as read_learned_answers names it (pattern), like "pattern:numbered:Lunch".' +
        NOTHING
      );
    }
    String seen = seenOf(body);
    String key = ImportAnswers.keyOf(
      campId,
      LearnedAnswers.markerOf(parts[1], parts[2])
    );
    List<ImportAnswer__c> marks = [
      SELECT Id
      FROM ImportAnswer__c
      WHERE Key__c = :key AND Camp__c = :campId
      WITH USER_MODE
      LIMIT 1
      FOR UPDATE
    ];
    String now = marks.isEmpty() ? 'none' : String.valueOf(marks[0].Id);
    if (!now.equals(seen)) {
      throw new AgentWeeks.ConflictException(
        'Someone forgot that pattern or undid it since you read it, so nothing was changed.' +
        READ_AGAIN
      );
    }
    List<Id> ids;
    try {
      ids = LearnedController.forgetLearnedPattern(campId, parts[1], parts[2]);
    } catch (Exception e) {
      throw new ShoreshException(ScreenErrors.words(e) + NOTHING);
    }
    return 'Forgot the pattern: the answers saved until now no longer count toward it, and they stay remembered. To undo it, use undo_learned_answer with undo "pattern:' +
      String.join(ids, ':') +
      '".';
  }

  /**
   * undo_learned_answer: the screen's Undo of a Change, Forget or Forget pattern, by the undo its
   * answer gave. As on the screen, only what this person just did: the newest thing that happened
   * to that answer, done by them. Never over a newer answer (LearnedUndo).
   */
  public static String undo(Map<String, Object> body) {
    Id campId = campOf(body);
    List<String> parts = raw(body, 'undo').trim().split(':');
    String kind = parts[0];
    Boolean ok =
      (kind == 'change' &&
      parts.size() == 3) ||
      (kind == 'forget' &&
      parts.size() == 2) ||
      (kind == 'pattern' && (parts.size() == 2 || parts.size() == 3));
    List<Id> ids = new List<Id>();
    try {
      for (Integer i = 1; ok && i < parts.size(); i++) {
        ids.add(Id.valueOf(parts[i]));
      }
    } catch (Exception e) {
      ok = false;
    }
    if (!ok) {
      throw new ShoreshException(
        'Say the undo a change, forget or forget pattern gave (undo), like "forget:a0X...".' +
        NOTHING
      );
    }
    // A Change or a Forget pattern is undone from what it saved; a Forget from what it forgot.
    String what = kind == 'change'
      ? LearnedEvents.CHANGED
      : LearnedEvents.FORGOTTEN;
    if (ids.size() == 2 && kind != 'forget') {
      // What it saved, locked; and what it replaced must be that same question's, in the bin.
      List<ImportAnswer__c> saved = [
        SELECT Key__c
        FROM ImportAnswer__c
        WHERE Id = :ids[0] AND Camp__c = :campId
        WITH USER_MODE
        LIMIT 1
        FOR UPDATE
      ];
      List<ImportAnswer__c> replaced = [
        SELECT Key__c
        FROM ImportAnswer__c
        WHERE Id = :ids[1] AND Camp__c = :campId AND IsDeleted = TRUE
        WITH USER_MODE
        LIMIT 1
        ALL ROWS
      ];
      if (
        saved.isEmpty() ||
        replaced.isEmpty() ||
        !saved[0].Key__c.equals(replaced[0].Key__c)
      ) {
        throw new AgentWeeks.ConflictException(
          'That can\'t be undone now: someone changed it since, or the undo isn\'t the one its answer gave.' +
          READ_AGAIN
        );
      }
    }
    if (!lastByMe(campId, ids[0], what)) {
      throw new AgentWeeks.ConflictException(
        'That can\'t be undone now: someone changed it since, or it wasn\'t you who did it.' +
        READ_AGAIN
      );
    }
    Boolean done;
    try {
      if (kind == 'change' || (kind == 'pattern' && ids.size() == 2)) {
        done = LearnedController.undoChangeLearned(campId, ids[0], ids[1]);
      } else if (kind == 'forget') {
        done = LearnedController.restoreLearned(campId, ids[0]);
      } else {
        done = LearnedController.forgetLearned(campId, ids[0]);
      }
    } catch (Exception e) {
      throw new ShoreshException(ScreenErrors.words(e) + NOTHING);
    }
    if (done != true) {
      throw stale();
    }
    return kind == 'change' ? 'Changed back.' : 'Remembered again.';
  }

  /** The newest thing that happened to this answer is this, done by the person asking. */
  private static Boolean lastByMe(Id campId, Id answerId, String what) {
    String said = String.valueOf(answerId);
    List<LearnedEvent__c> last = [
      SELECT What__c, CreatedById
      FROM LearnedEvent__c
      WHERE Camp__c = :campId AND AnswerId__c = :said
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 1
    ];
    return !last.isEmpty() &&
      last[0].What__c == what &&
      last[0].CreatedById == UserInfo.getUserId();
  }

  /** The camp of the season named (none: the season the screens open on). */
  private static Id campOf(Map<String, Object> body) {
    return AgentChangeCampWords.seasonOf(AgentFields.text(body, 'season'))
      .Camp__c;
  }

  /**
   * The camp's answer named (answer_id), locked, while its answer is still the one read (seen,
   * capitals and all); otherwise refused (409).
   */
  private static ImportAnswer__c locked(Id campId, Map<String, Object> body) {
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

  private static String seenOf(Map<String, Object> body) {
    if (!body.containsKey('seen') || body.get('seen') == null) {
      throw new ShoreshException(
        'Say what read_learned_answers gave as seen, so a change someone made since isn\'t replaced unseen.' +
        NOTHING
      );
    }
    return String.valueOf(body.get('seen'));
  }

  /** A field as sent, spaces kept (a pattern's name is as the camp wrote it). */
  private static String raw(Map<String, Object> body, String field) {
    Object value = body.get(field);
    return value == null ? '' : String.valueOf(value);
  }

  private static AgentWeeks.ConflictException stale() {
    return new AgentWeeks.ConflictException(
      'Someone changed or forgot that answer since you read it, so nothing was changed.' +
      READ_AGAIN
    );
  }
}
