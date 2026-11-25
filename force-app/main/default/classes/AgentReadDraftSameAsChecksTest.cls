/**
 * The draft an AI reads is word for word the week's checks (docs/protocol/api.md API-1.123), on
 * GeneratedTestData's camp, generated once in setup by a scheduler. Each read costs about 60
 * queries, so the checks are read in the test and the draft in a job of its own (each with its own
 * limits), as two requests are.
 */
@IsTest
private class AgentReadDraftSameAsChecksTest {
  private static String drafted;

  @TestSetup
  static void makeCamp() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids;
    System.runAs(scheduler) {
      ids = GeneratedTestData.camp();
      GeneratedTestData.generated();
    }
    ids.put('Scheduler', scheduler.Id);
    KeptCamp.keepIds(ids);
  }

  /** GET of Week 1 of Main in this season at the address; answers the body as sent. */
  private static String read(String season, Boolean draft) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'GET';
    RestContext.request.params.putAll(
      new Map<String, String>{
        'season' => season,
        'week' => 'Week 1',
        'program' => 'Main'
      }
    );
    RestContext.response = new RestResponse();
    if (draft) {
      AgentReadDraft.get();
    } else {
      AgentChecks.get();
    }
    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      RestContext.response.responseBody.toString()
    );
    return RestContext.response.responseBody.toString();
  }

  /** The draft read, as its own request. */
  private class DraftRead implements Queueable {
    private final String season;
    DraftRead(String season) {
      this.season = season;
    }
    public void execute(QueueableContext context) {
      drafted = read(season, true);
    }
  }

  // API-1.123: /v1/read_week_draft answers exactly what /v1/week_checks answers.
  @IsTest
  static void theDraftReadIsExactlyTheWeeksChecks() {
    Map<String, Id> ids = KeptCamp.keptIds();
    String season = [
      SELECT Name
      FROM Season__c
      WHERE Id = :ids.get('Season')
      WITH SYSTEM_MODE
    ]
    .Name;
    System.runAs(KeptCamp.scheduler(ids)) {
      Test.startTest();
      String checks = read(season, false);
      System.enqueueJob(new DraftRead(season));
      Test.stopTest();
      Assert.isTrue(checks.contains('"inputs"'), checks);
      Assert.areEqual(
        checks,
        drafted,
        'read_week_draft answered other than week_checks'
      );
    }
  }
}
