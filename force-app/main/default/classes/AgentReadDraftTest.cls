/**
 * A week's draft read through an agent or the command line (docs/protocol/api.md API-1.123):
 * /v1/read_week_draft answers exactly what /v1/week_checks answers, the week its screen opens
 * (Generated Schedule's or Manual Build's), on GeneratedTestData's camp. The cells are laid out
 * outside Salesforce by the screens' own modules (their tests: connect.test.js).
 */
@IsTest
private class AgentReadDraftTest {
  /** GET at this address for Week 1 of Main (on this screen, when named); answers [status, body]. */
  private static List<Object> read(Boolean draft, String schedule) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'GET';
    RestContext.request.params.putAll(
      new Map<String, String>{
        'season' => [
          SELECT Name
          FROM Season__c
          WHERE Id = :GeneratedTestData.ids.get('Season')
          WITH SYSTEM_MODE
        ]
        .Name,
        'week' => 'Week 1',
        'program' => 'Main'
      }
    );
    if (schedule != null) {
      RestContext.request.params.put('schedule', schedule);
    }
    RestContext.response = new RestResponse();
    if (draft) {
      AgentReadDraft.get();
    } else {
      AgentChecks.get();
    }
    return new List<Object>{
      RestContext.response.statusCode,
      JSON.deserializeUntyped(RestContext.response.responseBody.toString())
    };
  }

  // API-1.123
  @IsTest
  static void aDraftIsReadAsItsScreenReadsIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      GeneratedTestData.generated();
      Test.startTest();
      List<Object> draft = read(true, null);
      Integer queries = Limits.getQueries();
      List<Object> checks = read(false, null);
      Test.stopTest();
      Assert.areEqual(200, draft[0], String.valueOf(draft[1]));
      Assert.isTrue(queries < 100, queries + ' queries');
      Map<String, Object> body = (Map<String, Object>) draft[1];
      Assert.areEqual(
        new Set<String>{
          'inputs',
          'setup',
          'labels',
          'setup_changes',
          'accepted',
          'season'
        },
        body.keySet()
      );
      // The week as read: the seen its cell edits, locks and unlocks hand back.
      Assert.isNotNull(
        ((Map<String, Object>) body.get('inputs')).get('revision')
      );
      Assert.areEqual(JSON.serialize(checks[1]), JSON.serialize(draft[1]));
    }
  }

  // API-1.123
  @IsTest
  static void aWeekNeverBuiltHasNoDraft() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      List<Object> generated = read(true, null);
      List<Object> manual = read(true, 'Manual Build');
      Test.stopTest();
      Assert.areEqual(400, generated[0]);
      Assert.areEqual(
        'Week 1 hasn\'t been built for Main yet, so it has no draft.',
        ((Map<String, Object>) generated[1]).get('message')
      );
      Assert.areEqual(400, manual[0]);
      Assert.areEqual(
        'Week 1 hasn\'t been started on Manual Build for Main yet.',
        ((Map<String, Object>) manual[1]).get('message')
      );
    }
  }

  // API-1.123
  @IsTest
  static void aManualBuildWeekIsItsOwnDraft() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = ManualDrafts.start(
          GeneratedTestData.ids.get('Main'),
          GeneratedTestData.ids.get('Week 1')
        )
        .draftId;
      Test.startTest();
      List<Object> read = read(true, 'Manual Build');
      Integer queries = Limits.getQueries();
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Assert.isTrue(queries < 100, queries + ' queries');
      Map<String, Object> schedule = (Map<String, Object>) ((Map<String, Object>) ((Map<String, Object>) read[1])
          .get('draft'))
        .get('schedule');
      Assert.areEqual(
        String.valueOf(draftId),
        ((Map<String, Object>) schedule.get('schedule')).get('id')
      );
    }
  }
}
