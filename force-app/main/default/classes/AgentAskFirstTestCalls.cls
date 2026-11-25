/**
 * For tests: an AI action as a person who says yes (API-1.106). The action is sent as given;
 * when Shoresh asks first, the same request is sent again with the confirm it gave, as an AI does
 * after the person says yes. A refusal is left as it came. A change that asks first, sent as a POST
 * without a confirm, answering done without asking fails the test, so one whose preview stops
 * asking can't pass unseen. A GET, or a POST already carrying its confirm, is answered straight
 * away; so is a special schedule's frame, a call that takes nothing away, adding or changing a
 * setup record, which asks only for a fixed activity over a recurring one (API-1.147), and an
 * update to match setup or a special schedule's import, which ask only when they replace the
 * person's hand work.
 */
@IsTest
public class AgentAskFirstTestCalls {
  public static void answer(Object door) {
    if (door instanceof AgentRequest.Read) {
      AgentRequest.answer((AgentRequest.Read) door);
      return;
    }
    AgentRequest.Change action = (AgentRequest.Change) door;
    Blob sent = RestContext.request.requestBody;
    AgentRequest.answer(action);
    String confirm = confirmIn(RestContext.response);
    if (confirm == null) {
      Assert.isFalse(
        RestContext.response.statusCode == 200 && mustAsk(action, sent),
        'Done without asking first: ' +
        RestContext.response.responseBody?.toString()
      );
      return;
    }
    Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
      sent.toString()
    );
    body.put(AgentAskFirst.FIELD, confirm);
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentRequest.answer(action);
  }

  /** A change that asks first, sent as a POST without a confirm: it must ask, not answer done. */
  private static Boolean mustAsk(AgentRequest.Change action, Blob sent) {
    return action instanceof AgentAskFirst.Preview &&
      !(action instanceof AgentSpecialFrame) &&
      !(action instanceof AgentAddSetup) &&
      !(action instanceof AgentChangeSetup) &&
      !(action instanceof AgentUpdateToMatch) &&
      !(action instanceof AgentImportSpecialSchedule) &&
      RestContext.request.httpMethod == 'POST' &&
      sent != null &&
      sent.size() > 0 &&
      !((Map<String, Object>) JSON.deserializeUntyped(sent.toString()))
        .containsKey(AgentAskFirst.FIELD);
  }

  /**
   * The confirm Shoresh's preview gives for this POST, asked on its own: a test reads
   * Limits.getQueries() after it, so the yes request is counted alone, as it is in its own request
   * for real.
   */
  public static String confirmFor(
    AgentRequest.Change action,
    Map<String, Object> body
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentRequest.answer(action);
    return confirmIn(RestContext.response);
  }

  /** The confirm Shoresh's ask-first answer gave (its own part), or null when it didn't ask. */
  public static String confirmIn(RestResponse response) {
    if (response.statusCode != 200 || response.responseBody == null) {
      return null;
    }
    return (String) ((Map<String, Object>) JSON.deserializeUntyped(
        response.responseBody.toString()
      ))
      .get('confirm');
  }
}
