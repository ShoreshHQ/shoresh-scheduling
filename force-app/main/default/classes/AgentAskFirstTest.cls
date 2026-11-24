/**
 * The ask-first ticket (docs/protocol/api.md API-1.106): the same person, address, request and
 * camp give the same confirm, whatever order the fields come in; a camp changed since (what the
 * preview read) gives another, so an old confirm is refused. The answer hands back the preview
 * and its confirm as parts of their own, never only inside its sentence.
 */
@IsTest
private class AgentAskFirstTest {
  private static String ticket(String body, String state) {
    RestContext.request = new RestRequest();
    RestContext.request.requestURI = '/services/apexrest/v1/delete_version';
    RestContext.request.httpMethod = 'POST';
    AgentAskFirst.stateIs(state);
    return AgentAskFirst.ticketFor(
      'This deletes "First draft".',
      AgentRequestInOrder.of(body)
    );
  }

  // API-1.106
  @IsTest
  static void aConfirmIsTheSameOnlyForTheSameRequestAndCamp() {
    String first = ticket('{"week":"Week 1","version":"First draft"}', '7');
    String reordered = ticket('{"version":"First draft","week":"Week 1"}', '7');
    String changedSince = ticket(
      '{"week":"Week 1","version":"First draft"}',
      '8'
    );
    String otherWeek = ticket('{"week":"Week 2","version":"First draft"}', '7');
    String seats = ticket(
      '{"seats":[{"camperId":"a","day":"2026-06-29"}],"week":"Week 1"}',
      '7'
    );
    String seatsReordered = ticket(
      '{"week":"Week 1","seats":[{"day":"2026-06-29","camperId":"a"}]}',
      '7'
    );
    Assert.areEqual(first, reordered);
    Assert.areEqual(seats, seatsReordered, 'a seat\'s fields in any order');
    Assert.areNotEqual(first, changedSince);
    Assert.areNotEqual(first, otherWeek);
  }

  /** A change that asks first, as a stand-in: what it would do, and done when confirmed. */
  private class Deletes implements AgentRequest.Change, AgentAskFirst.Preview {
    public Set<String> fields() {
      return new Set<String>{ 'version' };
    }
    public String preview(Map<String, Object> body) {
      return 'This deletes "' + body.get('version') + '".';
    }
    public String run(Map<String, Object> body) {
      return 'Deleted "' + body.get('version') + '".';
    }
  }

  private static Map<String, Object> send(Map<String, Object> body) {
    RestContext.request = new RestRequest();
    RestContext.request.requestURI = '/services/apexrest/v1/delete_version';
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentRequest.answer(new Deletes());
    Map<String, Object> answered = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    answered.put('status', RestContext.response.statusCode);
    return answered;
  }

  // API-1.106, API-1.153
  @IsTest
  static void theAnswerHandsBackThePreviewAndConfirmAsParts() {
    System.runAs(ShoreshTestData.scheduler()) {
      Test.startTest();
      AgentAskFirst.stateIs('7');
      Map<String, Object> asked = send(
        new Map<String, Object>{ 'version' => 'First draft' }
      );
      Map<String, Object> stale = send(
        new Map<String, Object>{
          'version' => 'First draft',
          'confirm' => 'not-this-one'
        }
      );
      Map<String, Object> done = send(
        new Map<String, Object>{
          'version' => 'First draft',
          'confirm' => asked.get('confirm')
        }
      );
      Test.stopTest();

      String words = 'This deletes "First draft".';
      Assert.areEqual(200, asked.get('status'));
      Assert.areEqual(
        AgentAskFirst.NOT_YET + ' ' + words,
        asked.get('message')
      );
      Assert.areEqual(words, asked.get('preview'));
      Assert.isTrue(
        String.valueOf(asked.get('confirm')).length() == 12,
        String.valueOf(asked)
      );
      Assert.areEqual(409, stale.get('status'));
      Assert.areEqual(words, stale.get('preview'));
      Assert.areEqual(asked.get('confirm'), stale.get('confirm'));
      Assert.isFalse(
        String.valueOf(stale.get('message')).contains('confirm: "'),
        'the confirm is its own part'
      );
      Assert.areEqual(200, done.get('status'), String.valueOf(done));
      Assert.areEqual('Deleted "First draft".', done.get('message'));
      Assert.isFalse(done.containsKey('confirm'), String.valueOf(done));
      Assert.isFalse(done.containsKey('preview'), String.valueOf(done));
    }
  }
}
