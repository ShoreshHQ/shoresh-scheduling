/**
 * Building, publishing and finalizing through an agent or the command line (docs/protocol/api.md
 * API-1.21 to API-1.23): /v1/build_week, /v1/publish_week and /v1/finalize_electives on
 * GeneratedTestData's camp. The week "the engine built" is the test camp's Gym games week (the
 * engine itself runs outside Salesforce, API-1.19, and has its own tests).
 */
@IsTest
private class AgentBuildTest {
  private static Map<String, Object> week(Map<String, Object> more) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => [
        SELECT Name
        FROM Season__c
        WHERE Id = :GeneratedTestData.ids.get('Season')
        WITH SYSTEM_MODE
      ]
      .Name,
      'week' => 'Week 1'
    };
    body.putAll(more);
    return body;
  }

  /** The week as read, filled with Gym games, as the connector sends what the engine built. */
  private static Map<String, Object> built() {
    GeneratedWeek.Save save = GeneratedTestData.filled(
      GeneratedTestData.request(
        GeneratedTestData.inputs(),
        GeneratedSaves.GENERATE,
        1
      ),
      'Gym games'
    );
    return week(
      new Map<String, Object>{
        'program' => 'Main',
        'revision' => save.revision,
        'option' => 1,
        'days' => JSON.deserializeUntyped(JSON.serialize(save.days)),
        'engine_notes' => null
      }
    );
  }

  /** Sends body to the web address; answers [status, sentence]. */
  private static List<Object> send(String address, Map<String, Object> body) {
    RestContext.request = new RestRequest();
    RestContext.request.requestURI = '/services/apexrest/v1/' + address;
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    if (address == 'build_week') {
      AgentBuild.post();
    } else if (address == 'publish_week') {
      AgentPublish.post();
    } else if (address == 'finalize_electives') {
      AgentFinalize.post();
    } else {
      AgentUndo.post();
    }
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  private static String periodTwo(Id draftId) {
    return GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
      GeneratedTestData.PERIOD_2
    ];
  }

  private static Id draft() {
    return GeneratedDrafts.find(
        GeneratedTestData.ids.get('Main'),
        GeneratedTestData.ids.get('Week 1')
      )
      .Id;
  }

  // API-1.21
  @IsTest
  static void aBuildReadsWhatGenerateReads() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'GET';
      RestContext.request.params.putAll(
        new Map<String, String>{
          'season' => (String) week(new Map<String, Object>()).get('season'),
          'week' => 'Week 1',
          'program' => 'Main'
        }
      );
      RestContext.response = new RestResponse();
      AgentBuild.get();
      Test.stopTest();
      Assert.areEqual(
        200,
        RestContext.response.statusCode,
        RestContext.response.responseBody.toString()
      );
      Map<String, Object> read = (Map<String, Object>) JSON.deserializeUntyped(
        RestContext.response.responseBody.toString()
      );
      Assert.areEqual(
        new Set<String>{ 'inputs', 'setup', 'labels' },
        read.keySet()
      );
    }
  }

  // API-1.21
  @IsTest
  static void aBuildSavesThroughGeneratesSaveAndUndoLeavesItBlank() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Map<String, Object> body = built();
      Test.startTest();
      List<Object> answer = send('build_week', body);
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual('Built Week 1.', answer[1]);
      Id draftId = draft();
      Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
      List<Schedule__c> marked = [
        SELECT Name, RevisionsAfter__c
        FROM Schedule__c
        WHERE VersionReason__c = :AgentWeeks.THROUGH_AGENT
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(1, marked.size());
      Assert.areEqual('Before Built Week 1', marked[0].Name);
      Assert.isNotNull(marked[0].RevisionsAfter__c);

      Test.stopTest();
      // Undo puts back the week as it was before the build: blank.
      List<Object> undone = send(
        'undo_last_agent_change',
        week(new Map<String, Object>{ 'program' => 'Main' })
      );
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual('Undid "Built Week 1".', undone[1]);
      Assert.areNotEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
    }
  }

  // API-1.21
  @IsTest
  static void aWeekSavedSinceItWasReadIsAConflictAndNothingChanges() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      // Read for a first build, but someone generated the week meanwhile.
      Map<String, Object> body = built();
      Id draftId = GeneratedTestData.generated();
      List<Object> answer = send('build_week', body);
      Test.stopTest();
      Assert.areEqual(409, answer[0], String.valueOf(answer[1]));
      Assert.areEqual(ScheduleDaySaves.CHANGED_SINCE, answer[1]);
      Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE VersionReason__c = :AgentWeeks.THROUGH_AGENT
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  // API-1.22
  @IsTest
  static void publishIsTheScreensPublishWithItsSentences() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      Map<String, Object> body = week(
        new Map<String, Object>{ 'program' => 'Main' }
      );
      List<Object> notBuilt = send('publish_week', body);
      Assert.areEqual(400, notBuilt[0]);
      Assert.areEqual(
        'Week 1 hasn\'t been built for Main yet. Build it first (build_week).',
        notBuilt[1]
      );
      GeneratedTestData.generated();
      List<Object> published = send('publish_week', body);
      List<Object> again = send('publish_week', body);
      Test.stopTest();
      Assert.areEqual(200, published[0], String.valueOf(published[1]));
      Assert.areEqual('Published Week 1.', published[1]);
      Assert.areEqual('Week 1 is already published as it is.', again[1]);
    }
  }

  // API-1.23
  @IsTest
  static void finalizeIsTheScreensFinalizeWithItsRefusals() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      insert new ElectiveSet__c(
        Season__c = GeneratedTestData.ids.get('Season'),
        Name = 'Chugim'
      );
      Test.startTest();
      List<Object> noSeats = send(
        'finalize_electives',
        week(new Map<String, Object>{ 'elective_set' => 'Chugim' })
      );
      List<Object> noSuchSet = send(
        'finalize_electives',
        week(new Map<String, Object>{ 'elective_set' => 'Sports' })
      );
      Test.stopTest();
      Assert.areEqual(400, noSeats[0]);
      Assert.areEqual('Not finalized. Assign seats first.', noSeats[1]);
      Assert.areEqual(
        'There is no elective set called "Sports" that this user can see. The elective sets: Chugim.',
        noSuchSet[1]
      );
    }
  }
}
