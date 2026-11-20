/**
 * One AI request, start to end (docs/protocol/api.md API-1.9, API-1.105, API-1.108, API-1.152):
 * a read (a GET) declares the fields its web address takes and answers JSON; this takes its
 * fields, refuses one it doesn't take, says the season it used, and shapes a refusal. User mode
 * throughout: each read runs as the person, with exactly their access.
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
        seasonal ? OutgoingRows.said(answered) : answered
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
}
