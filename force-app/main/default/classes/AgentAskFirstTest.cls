/**
 * The ask-first ticket (docs/protocol/api.md API-1.106): the same person, address, request and
 * camp give the same confirm, whatever order the fields come in; a camp changed since (what the
 * preview read) gives another, so an old confirm is refused.
 */
@IsTest
private class AgentAskFirstTest {
  private static String ticket(String body, String state) {
    RestContext.request = new RestRequest();
    RestContext.request.requestURI = '/services/apexrest/v1/delete_version';
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(body);
    AgentAskFirst.stateIs(state);
    return AgentAskFirst.ticketFor('This deletes "First draft".');
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
    Assert.areEqual(first, reordered);
    Assert.areNotEqual(first, changedSince);
    Assert.areNotEqual(first, otherWeek);
  }
}
