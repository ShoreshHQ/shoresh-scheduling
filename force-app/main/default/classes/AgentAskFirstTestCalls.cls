/**
 * For tests: an AI action as a person who says yes (API-1.106). The action is sent as given;
 * when Shoresh asks first, the same request is sent again with the confirm it gave, as an AI does
 * after the person says yes. Any other answer is left as it came.
 */
@IsTest
public class AgentAskFirstTestCalls {
  public static void answer(AgentWeeks.Action action) {
    Blob sent = RestContext.request.requestBody;
    AgentWeeks.answer(action);
    String confirm = confirmIn(RestContext.response);
    if (confirm == null) {
      return;
    }
    Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
      sent.toString()
    );
    body.put(AgentAskFirst.FIELD, confirm);
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentWeeks.answer(action);
  }

  /**
   * The confirm Shoresh's preview gives for this POST, asked on its own: a test reads it before
   * Test.startTest, so the yes request is counted alone, as it is in its own request for real.
   */
  public static String confirmFor(
    AgentWeeks.Action action,
    Map<String, Object> body
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentWeeks.answer(action);
    return confirmIn(RestContext.response);
  }

  /** The confirm Shoresh's ask-first answer gave, or null when it didn't ask. */
  public static String confirmIn(RestResponse response) {
    if (response.statusCode != 200 || response.responseBody == null) {
      return null;
    }
    String message = (String) ((Map<String, Object>) JSON.deserializeUntyped(
        response.responseBody.toString()
      ))
      .get('message');
    if (message == null || !message.startsWith(AgentAskFirst.NOT_YET)) {
      return null;
    }
    return message.substringAfterLast('confirm: "').substringBefore('"');
  }
}
