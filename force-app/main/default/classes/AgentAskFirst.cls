/**
 * Ask first, enforced by Shoresh (docs/protocol/api.md API-1.106): an AI change that removes or
 * replaces something for good is done only with the ticket its own preview gave. Sent without
 * confirm, the change is not made: the answer says in plain words what it would do and hands
 * back the ticket, as parts of their own (asked: preview and confirm), for the AI to show the
 * person and ask. The ticket is the person, the address,
 * what was asked and that preview, so a ticket for another target, another person, or a
 * camp that changed since (its preview reads differently now) is refused with nothing done.
 */
public with sharing class AgentAskFirst {
  public static final String FIELD = 'confirm';
  public static final String NOT_YET = 'Nothing has been done yet.';
  // What this request's preview asked, for the answer's own parts (AgentRequest): preview, the
  // words to show the person; confirm, the ticket. Null when it asked nothing.
  public static Map<String, String> asked;
  // What the preview read that the person needn't see (a revision), still part of the ticket.
  private static String state = '';

  /** Ties the ticket to state too, unsaid: a change since makes the ticket stale. */
  public static void stateIs(String now) {
    state = now ?? '';
  }

  /** A change that asks first: what it would do, said from the camp as it is now. */
  public interface Preview {
    /** What the change would do, in plain words; null when this call takes nothing away. */
    String preview(Map<String, Object> body);
  }

  /**
   * Runs change on its body as the runner does, asking first when it is a Preview: given is the
   * confirm the runner took out of the body (taken), or null.
   */
  public static String run(
    AgentRequest.Change change,
    Map<String, Object> body,
    String given
  ) {
    if (!(change instanceof Preview)) {
      return change.run(body);
    }
    // The ticket's request: the body as sent, confirm aside, before the preview reads it.
    String sent = AgentRequestInOrder.of(JSON.serialize(body));
    String words = ((Preview) change).preview(body);
    String notYet = words == null
      ? null
      : question(words, ticketFor(words, sent), given);
    if (notYet != null) {
      return notYet;
    }
    return change.run(body);
  }

  /**
   * Null when given is the confirm this preview gives; otherwise that nothing was done yet, or
   * refused when given is another. Either way the preview and its confirm go back as parts.
   */
  private static String question(String words, String ticket, String given) {
    if (given != null && given.equals(ticket)) {
      return null;
    }
    asked = new Map<String, String>{ 'preview' => words, 'confirm' => ticket };
    if (String.isBlank(given)) {
      return NOT_YET + ' ' + words;
    }
    throw new AgentWeeks.ConflictException(
      'Nothing was done: confirm is not the one for this, or something changed since it was shown. Now it would be: ' +
      words
    );
  }

  /** confirm, taken out of the body (a Preview's), so the change reads only its own fields. */
  public static String taken(Map<String, Object> body) {
    Object given = body.remove(FIELD);
    return given == null ? null : String.valueOf(given).trim();
  }

  /**
   * The ticket: the same person, address, request (sent: its fields in order, confirm aside) and
   * preview always give the same one.
   */
  @TestVisible
  private static String ticketFor(String words, String sent) {
    String said = String.join(
      new List<String>{
        UserInfo.getUserId(),
        RestContext.request.requestURI,
        sent,
        words,
        state
      },
      '\n'
    );
    return EncodingUtil.convertToHex(
        Crypto.generateDigest('SHA-256', Blob.valueOf(said))
      )
      .left(12);
  }
}
