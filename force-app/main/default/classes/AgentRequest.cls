/**
 * One AI request, start to end (docs/protocol/api.md API-1.9, API-1.11, API-1.105, API-1.106,
 * API-1.108, API-1.152): a read (a GET) or a change (a POST) declares the fields it takes; this
 * takes them from the web address or the body, refuses one it doesn't take, lifts out a change's
 * confirm (AgentAskFirst), says the season it used, and shapes a refusal the same way for both.
 * User mode throughout: each request runs as the person, with exactly their access.
 */
public with sharing class AgentRequest {
  /**
   * One read through an agent (a GET): the fields its web address takes, by their plain names, and
   * its answer as a JSON object.
   */
  public interface Read {
    Set<String> fields();
    String run(Map<String, Object> asked);
  }

  /** A read whose answer is one plain sentence, answered as {"message": sentence}. */
  public interface SentenceRead extends Read {
  }

  /**
   * One change through an agent (a POST): the fields its body takes, by their plain names, and
   * its answer when done, one plain sentence. It never sees confirm: the runner lifts it out.
   */
  public interface Change {
    Set<String> fields();
    String run(Map<String, Object> body);
  }

  /**
   * Runs one change and answers {"message": sentence}: 200 when done, or its refusal (refused),
   * with nothing changed. Every change takes the right to change schedules (AgentAccess), refused
   * in the same words for every one.
   */
  public static void answer(Change change) {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    Savepoint before = Database.setSavepoint();
    String message;
    AgentUndoHeld.forget();
    AgentRefusal.forAgent = true;
    try {
      AgentAccess.require();
      Map<String, Object> body = AgentFields.sent();
      String confirm = change instanceof AgentAskFirst.Preview
        ? AgentAskFirst.taken(body)
        : null;
      AgentFields.requireKnown(body.keySet(), change.fields());
      message = AgentAskFirst.run(change, body, confirm);
      response.statusCode = 200;
    } catch (Exception e) {
      Database.rollback(before);
      message = refused(e, response);
    } finally {
      AgentRefusal.forAgent = false;
    }
    response.responseBody = Blob.valueOf(
      JSON.serialize(
        AgentUndoHeld.answered(
          OutgoingRows.answered(message),
          response.statusCode
        )
      )
    );
  }

  /**
   * Answers one read: a field it doesn't take is refused, naming the ones it does (API-1.152);
   * its answer, or its refusal (refused), says which season it used when it takes one
   * (API-1.108). An AI hears the screen's refusals without their advice (API-1.105).
   */
  public static void answer(Read read) {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    Boolean seasonal = read.fields().contains('season');
    AgentRefusal.forAgent = true;
    try {
      String answered = read.run(AgentFields.query(read.fields()));
      if (read instanceof SentenceRead) {
        answered = JSON.serialize(
          new Map<String, String>{ 'message' => answered }
        );
      }
      response.responseBody = Blob.valueOf(
        seasonal ? said(answered) : answered
      );
      response.statusCode = 200;
    } catch (Exception e) {
      String message = refused(e, response);
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          seasonal
            ? OutgoingRows.answered(message)
            : new Map<String, String>{ 'message' => message }
        )
      );
    } finally {
      AgentRefusal.forAgent = false;
    }
  }

  /**
   * A refusal's words, its status set: 409 for someone else's change, 400 for a refusal in
   * Shoresh's or the screen's words, 500 for anything else (in Shoresh's words too).
   */
  private static String refused(Exception e, RestResponse response) {
    if (e instanceof AgentWeeks.ConflictException) {
      response.statusCode = 409;
      return e.getMessage();
    }
    Boolean ours =
      e instanceof ShoreshException || e instanceof AuraHandledException;
    response.statusCode = ours ? 400 : 500;
    return ours ? e.getMessage() : ScreenErrors.words(e);
  }

  /**
   * A read's answer (a JSON object, as the read serialized it), saying first which season it
   * used (API-1.108), unless it already says one itself.
   */
  @TestVisible
  private static String said(String answer) {
    Season__c season = OutgoingRows.used ?? SeasonAsked.found();
    if (season == null || saysSeason(answer)) {
      return answer;
    }
    String rest = answer.substring(1).trim();
    return '{"season":' +
      JSON.serialize(season.Name) +
      (rest == '}' ? '' : ',') +
      rest;
  }

  /** Whether the answer has a season of its own at its top level (not one inside it). */
  private static Boolean saysSeason(String answer) {
    JSONParser parser = JSON.createParser(answer);
    parser.nextToken();
    while (parser.nextToken() == JSONToken.FIELD_NAME) {
      if (parser.getText().equals('season')) {
        return true;
      }
      parser.nextToken();
      parser.skipChildren();
    }
    return false;
  }
}
