/**
 * A week's checks through an agent or the command line (docs/protocol/api.md API-1.30, API-1.31):
 * /v1/week_checks answers what Generated Schedule's counter reads, and /v1/accept_finding keeps an
 * Accept through the counter's own save (WeekAccepts), on GeneratedTestData's camp. The checks
 * themselves are worked out outside Salesforce by the screen's own modules (their tests: Jest
 * shoreshGeneratedSchedule).
 */
@IsTest
private class AgentChecksTest {
  private static String season() {
    return [
      SELECT Name
      FROM Season__c
      WHERE Id = :GeneratedTestData.ids.get('Season')
      WITH SYSTEM_MODE
    ]
    .Name;
  }

  /** GET /v1/week_checks for Week 1 of Main; answers [status, body]. */
  private static List<Object> read() {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'GET';
    RestContext.request.params.putAll(
      new Map<String, String>{
        'season' => season(),
        'week' => 'Week 1',
        'program' => 'Main'
      }
    );
    RestContext.response = new RestResponse();
    AgentChecks.get();
    return new List<Object>{
      RestContext.response.statusCode,
      JSON.deserializeUntyped(RestContext.response.responseBody.toString())
    };
  }

  /** POST /v1/accept_finding with this line; answers [status, sentence]. */
  private static List<Object> accept(Object line) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(
      JSON.serialize(
        new Map<String, Object>{
          'season' => season(),
          'week' => 'Week 1',
          'program' => 'Main',
          'line' => line
        }
      )
    );
    RestContext.response = new RestResponse();
    AgentAccept.post();
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  private static final String NOT_BUILT = 'Week 1 hasn\'t been built for Main yet, so it has no checks. Build it first (build_week).';

  // API-1.30
  @IsTest
  static void aWeeksChecksReadWhatTheCounterReads() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      WeekAccepts.accept(draftId, '{"k":"under|a1|2|4","s":"under|a1","n":2}');
      Test.startTest();
      List<Object> after = read();
      Integer queries = Limits.getQueries();
      Test.stopTest();
      Assert.areEqual(200, after[0], String.valueOf(after[1]));
      Assert.isTrue(queries < 100, queries + ' queries');
      Map<String, Object> body = (Map<String, Object>) after[1];
      Assert.areEqual(
        new Set<String>{
          'inputs',
          'setup',
          'labels',
          'setup_changes',
          'accepted'
        },
        body.keySet()
      );
      Assert.areEqual(WeekAccepts.accepted(draftId), body.get('accepted'));
    }
  }

  // API-1.30
  @IsTest
  static void aWeekNeverBuiltHasNoChecks() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      List<Object> before = read();
      Test.stopTest();
      Assert.areEqual(400, before[0]);
      Assert.areEqual(
        NOT_BUILT,
        ((Map<String, Object>) before[1]).get('message')
      );
    }
  }

  // API-1.31
  @IsTest
  static void anAcceptIsTheCountersOwnSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      Map<String, Object> line = new Map<String, Object>{
        'k' => 'under|a1|2|4',
        's' => 'under|a1',
        'n' => 2
      };
      List<Object> notBuilt = accept(line);
      Id draftId = GeneratedTestData.generated();
      List<Object> kept = accept(line);
      List<Object> refused = accept(new Map<String, Object>{ 'n' => 1 });
      Test.stopTest();
      Assert.areEqual(400, notBuilt[0]);
      Assert.areEqual(NOT_BUILT, notBuilt[1]);
      Assert.areEqual(200, kept[0], String.valueOf(kept[1]));
      Assert.areEqual('Accepted.', kept[1]);
      Assert.areEqual(400, refused[0]);
      Assert.areEqual('That line could not be accepted.', refused[1]);
      List<Object> lines = (List<Object>) JSON.deserializeUntyped(
        WeekAccepts.accepted(draftId)
      );
      Assert.areEqual(1, lines.size());
      Assert.areEqual(
        'under|a1|2|4',
        ((Map<String, Object>) lines[0]).get('k')
      );
    }
  }
}
