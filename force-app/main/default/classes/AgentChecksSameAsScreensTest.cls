/**
 * The week's checks an AI reads (/v1/week_checks, and so /v1/read_week_draft) are word for word
 * what the screens read on their own: Generated Schedule's getInputs or Manual Build's draft, and
 * getSetupChanges (docs/protocol/api.md API-1.30, API-1.123), though the request reads the week's
 * setup only once. Setup is changed after the week was built (a fixed activity added, a recurring
 * one taken off the week), so the setup changes have something to say. Synthetic camp
 * (GeneratedTestData).
 */
@IsTest
private class AgentChecksSameAsScreensTest {
  /** After the week was built: Lineup in Period 2, and Rest off Week 1. */
  private static void changeSetup(Map<String, Id> ids) {
    SetTimeGuard.defer();
    try {
      Database.insert(
        new List<SObject>{
          SetTimeTestData.fixed(ids, 'Lineup', 'Period 2'),
          new WeekException__c(
            Week__c = ids.get('Week 1'),
            RecurringActivity__c = ids.get('Rest')
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      SetTimeGuard.checkPending();
    } finally {
      SetTimeGuard.resume();
    }
  }

  /** GET /v1/week_checks for Week 1 of Main (schedule: null for the week's only one). */
  private static Map<String, Object> checks(String schedule) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'GET';
    RestContext.request.params.putAll(
      new Map<String, String>{
        'season' => [SELECT Name FROM Season__c WITH USER_MODE LIMIT 1]
        .Name,
        'week' => 'Week 1',
        'program' => 'Main'
      }
    );
    if (schedule != null) {
      RestContext.request.params.put('schedule', schedule);
    }
    RestContext.response = new RestResponse();
    AgentChecks.get();
    String body = RestContext.response.responseBody.toString();
    Assert.areEqual(200, RestContext.response.statusCode, body);
    return (Map<String, Object>) JSON.deserializeUntyped(body);
  }

  /** A screen's answer as the AI's answer sends it (nulls left out), read back. */
  private static String asSent(Object screen) {
    return JSON.serialize(
      JSON.deserializeUntyped(JSON.serialize(screen, true))
    );
  }

  /** The setup changes a screen lists, which must not be none for the comparison to count. */
  private static void assertSomeChanges(String changes) {
    Map<String, Object> preview = (Map<String, Object>) JSON.deserializeUntyped(
      changes
    );
    Assert.isFalse(
      ((List<Object>) preview.get('changes')).isEmpty(),
      'Setup changed since the week was built: ' + changes
    );
  }

  // API-1.30, API-1.123
  @IsTest
  static void aGeneratedWeeksChecksAreTheScreensOwnReads() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      changeSetup(ids);
      Test.startTest();
      Map<String, Object> body = checks(null);
      String inputs = asSent(
        GeneratedScheduleController.getInputs(
          ids.get('Main'),
          ids.get('Week 1')
        )
      );
      String changes = asSent(SetupMatchController.getSetupChanges(draftId));
      Test.stopTest();
      assertSomeChanges(changes);
      Assert.areEqual(inputs, JSON.serialize(body.get('inputs')));
      Assert.areEqual(changes, JSON.serialize(body.get('setup_changes')));
    }
  }

  // API-1.30, API-1.123
  @IsTest
  static void aManualBuildWeeksChecksAreTheScreensOwnReads() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = ManualDrafts.start(ids.get('Main'), ids.get('Week 1'))
        .draftId;
      changeSetup(ids);
      Test.startTest();
      Map<String, Object> body = checks('Manual Build');
      String draft = asSent(ManualBuildViews.open(draftId));
      String changes = asSent(SetupMatchController.getSetupChanges(draftId));
      Test.stopTest();
      assertSomeChanges(changes);
      Assert.areEqual(draft, JSON.serialize(body.get('draft')));
      Assert.areEqual(changes, JSON.serialize(body.get('setup_changes')));
    }
  }
}
