/**
 * Ask first, enforced by Shoresh (docs/protocol/api.md API-1.106): an AI change that removes or
 * replaces something for good is done only with the ticket its own preview gave. Sent without
 * confirm, the change is not made: the answer says in plain words what it would do and hands
 * back the ticket, for the AI to show the person and ask. The ticket is the person, the address,
 * what was asked and that preview, so a ticket for another target, another person, or a
 * camp that changed since (its preview reads differently now) is refused with nothing done.
 */
public with sharing class AgentAskFirst {
  public static final String FIELD = 'confirm';
  public static final String NOT_YET = 'Nothing has been done yet.';
  // What the preview read that the person needn't see (a revision), still part of the ticket.
  private static String state = '';

  /** Ties the ticket to state too, unsaid: a change since makes the ticket stale. */
  public static void stateIs(String now) {
    state = now ?? '';
  }

  /** A change that asks first: what it would do, said from the camp as it is now. */
  public interface Preview {
    /** What the change would do, in plain words; null when this call takes nothing away. */
    String preview();
  }

  /** Runs action as the runner does, asking first when it is a Preview (POST only). */
  public static String run(AgentWeeks.Action action) {
    if (
      !(action instanceof Preview) || RestContext.request.httpMethod == 'GET'
    ) {
      return action.run();
    }
    String given = taken();
    String words = ((Preview) action).preview();
    return words == null ? action.run() : asked(action, words, given);
  }

  /** Done only with the confirm this preview gives; otherwise the preview, or refused. */
  private static String asked(
    AgentWeeks.Action action,
    String words,
    String given
  ) {
    String ticket = ticketFor(words);
    if (String.isBlank(given)) {
      return NOT_YET +
        ' ' +
        words +
        ' Show the person exactly this and ask. Only if they say yes, send the same request again with confirm: "' +
        ticket +
        '".';
    }
    if (!given.equals(ticket)) {
      throw new AgentWeeks.ConflictException(
        'Nothing was done: confirm is not the one for this, or something changed since it was shown. Now it would be: ' +
          words +
          ' Show the person this and ask again; only if they say yes, send it with confirm: "' +
          ticket +
          '".'
      );
    }
    return action.run();
  }

  /** confirm, taken out of the body so the action reads only its own fields. */
  private static String taken() {
    RestRequest request = RestContext.request;
    Object parsed;
    try {
      parsed = request.requestBody == null
        ? null
        : JSON.deserializeUntyped(request.requestBody.toString());
    } catch (JSONException e) {
      return null; // The action refuses it in its own words.
    }
    if (!(parsed instanceof Map<String, Object>)) {
      return null;
    }
    Map<String, Object> body = (Map<String, Object>) parsed;
    if (!body.containsKey(FIELD)) {
      return null;
    }
    Object given = body.remove(FIELD);
    request.requestBody = Blob.valueOf(JSON.serialize(body));
    return given == null ? null : String.valueOf(given).trim();
  }

  /** The ticket: the same person, address, request and preview always give the same one. */
  @TestVisible
  private static String ticketFor(String words) {
    RestRequest request = RestContext.request;
    String body = request.requestBody == null
      ? ''
      : sorted(request.requestBody.toString());
    String said = String.join(
      new List<String>{
        UserInfo.getUserId(),
        request.requestURI,
        body,
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

  /** The request's fields in name order, so their order never changes the ticket. */
  private static String sorted(String body) {
    Object parsed = JSON.deserializeUntyped(body);
    if (!(parsed instanceof Map<String, Object>)) {
      return body;
    }
    Map<String, Object> given = (Map<String, Object>) parsed;
    List<String> keys = new List<String>(given.keySet());
    keys.sort();
    List<String> parts = new List<String>();
    for (String key : keys) {
      parts.add(key + '=' + JSON.serialize(given.get(key)));
    }
    return String.join(parts, '\n');
  }
}
