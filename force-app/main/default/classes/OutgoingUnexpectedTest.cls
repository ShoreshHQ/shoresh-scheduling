/**
 * A problem Shoresh didn't expect, on the way out (docs/protocol/api.md API-1.9): over a real web
 * request it is still said in Shoresh's words. Camp Willow's Summer 2026 (synthetic).
 */
@IsTest
private class OutgoingUnexpectedTest {
  /** The group schedule, but reading its rows fails in a way Shoresh didn't expect. */
  private class Broken implements OutgoingDoors.Capability {
    private OutgoingGroupSchedule real = new OutgoingGroupSchedule();
    public String name() {
      return real.name();
    }
    public String what() {
      return real.what();
    }
    public String permissionSet() {
      return real.permissionSet();
    }
    public String permissionLabel() {
      return real.permissionLabel();
    }
    public List<String> fields() {
      return real.fields();
    }
    public List<Map<String, Object>> rows(Season__c season, String week) {
      throw new UnexpectedException('not one of Shoresh\'s own');
    }
  }

  private class UnexpectedException extends Exception {
  }

  // API-1.9: over a real web request, a problem Shoresh didn't expect still answers in Shoresh's
  // words ({"message": ...}), never the platform's error; a send says it the same way.
  @IsTest
  static void anUnexpectedProblemOverTheWebIsSaidPlainly() {
    IncomingTestData camp = new IncomingTestData();
    ScreenErrors.overWeb = true;
    RestRequest request = new RestRequest();
    request.httpMethod = 'GET';
    request.params.put('season', 'Summer 2026');
    request.params.put('week', 'Week 1');
    OutgoingDoors.Send send = new OutgoingDoors.Send();
    send.toSystem = 'formstack';
    send.season = 'Summer 2026';
    send.week = 'Week 1';
    List<OutgoingResult> results;
    System.runAs(camp.sender('Read_Group_Schedules')) {
      RestContext.request = request;
      RestContext.response = new RestResponse();
      OutgoingDoors.byWeb(new Broken());
      results = OutgoingDoors.bySend(
        new Broken(),
        new List<OutgoingDoors.Send>{ send }
      );
    }
    Assert.areEqual(500, RestContext.response.statusCode);
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    Assert.areEqual(
      'Shoresh couldn\'t tell why. Try again.',
      answer.get('message')
    );
    Assert.areEqual(
      'Couldn\'t send the group schedule for Week 1 to formstack: Shoresh couldn\'t tell why. Try again.',
      results[0].message
    );
  }
}
