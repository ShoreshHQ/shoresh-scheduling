/**
 * Building, publishing and finalizing through an agent or the command line (docs/protocol/api.md
 * API-1.21 to API-1.23, API-1.148): /v1/build_week, /v1/publish_week and /v1/finalize_electives on
 * GeneratedTestData's camp. The week "the engine built" is the test camp's Gym games week (the
 * engine itself runs outside Salesforce, API-1.19, and has its own tests).
 */
@IsTest
private class AgentBuildTest {
  // What the last answer left for the connector to hold for Undo.
  private static Map<String, Object> undo;
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
      AgentAskFirstTestCalls.answer(new AgentFinalize());
    } else {
      AgentAskFirstTestCalls.answer(new AgentUndo());
    }
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    undo = AgentUndoTestCalls.undoIn(RestContext.response);
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  /** Undo, as the connector sends it with what the last change's answer left. */
  private static Map<String, Object> undoAsked() {
    return week(
      new Map<String, Object>{
        'program' => 'Main',
        'held' => AgentUndoTestCalls.held(undo)
      }
    );
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

  /** The week generated, then what the connector sends for a Build menu action on it. */
  private static Map<String, Object> menu(String action, Integer option) {
    GeneratedTestData.generated();
    return menuAgain(action, option);
  }

  /** What the connector sends for a Build menu action on the week as it is now. */
  private static Map<String, Object> menuAgain(String action, Integer option) {
    GeneratedWeek.Save save = GeneratedTestData.request(
      GeneratedTestData.inputs(),
      action,
      option
    );
    if (action == GeneratedSaves.START_OVER) {
      save = StartOverTestData.cleared(save);
    }
    return week(
      new Map<String, Object>{
        'program' => 'Main',
        'action' => action,
        'revision' => save.revision,
        'option' => option,
        'days' => JSON.deserializeUntyped(JSON.serialize(save.days)),
        'engine_notes' => null
      }
    );
  }

  private static Integer optionNow() {
    return [
        SELECT EngineOption__c
        FROM Schedule__c
        WHERE Id = :draft()
        WITH SYSTEM_MODE
      ]
      .EngineOption__c
      .intValue();
  }

  /** Every version kept, by name; each one Auto-saved, as the screen keeps it. */
  private static Set<String> versionsMade() {
    Set<String> names = new Set<String>();
    for (Schedule__c version : [
      SELECT Name, VersionReason__c
      FROM Schedule__c
      WHERE Status__c = :ManualVersions.VERSION
      WITH SYSTEM_MODE
    ]) {
      Assert.areEqual(
        ManualVersions.AUTO_SAVED,
        version.VersionReason__c,
        version.Name
      );
      names.add(version.Name);
    }
    return names;
  }

  // API-1.127, API-1.128, API-1.148: only the screen's own version, and no Undo, as on screen.
  @IsTest
  static void tryAnotherSavesThroughTheScreensSaveOnTheOptionAskedAndKeepsOnlyItsVersion() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Map<String, Object> body = menu(GeneratedSaves.TRY_ANOTHER, 2);
      Test.startTest();
      List<Object> answer = send('build_week', body);
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual('Option 2 of Week 1.', answer[1]);
      Assert.areEqual(2, optionNow());
      Assert.areEqual(new Set<String>{ 'Before Try another' }, versionsMade());
      Assert.areEqual('none', undo.get('kind'));
      Assert.areEqual('Before Try another', undo.get('version_name'));
    }
  }

  // API-1.129, API-1.148: as on the screen, no version and no Undo.
  @IsTest
  static void fillOpenSavesThroughTheScreensSaveAndKeepsNoVersion() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Map<String, Object> body = menu(GeneratedSaves.FILL_OPEN, 1);
      Test.startTest();
      List<Object> answer = send('build_week', body);
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual(
        'Placed what fits in the open cells of Week 1.',
        answer[1]
      );
      Assert.isTrue(versionsMade().isEmpty(), versionsMade().toString());
      Assert.areEqual('none', undo.get('kind'));
      Assert.isNull(undo.get('version_name'));
    }
  }

  // API-1.127
  @IsTest
  static void notesTheServerCantKeepAreSaidAsOnTheScreen() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Map<String, Object> body = menu(GeneratedSaves.TRY_ANOTHER, 2);
      body.put('engine_notes', 'not notes');
      Test.startTest();
      List<Object> answer = send('build_week', body);
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual(
        'Option 2 of Week 1. Week 1 was saved without the reasons for how it was built.',
        answer[1]
      );
    }
  }

  // API-1.130, LOCK-5.1
  @IsTest
  static void startOverSavesThroughTheScreensSaveClearingTheWeekAndItsLocks() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      GeneratedWeek.LockChange lock = new GeneratedWeek.LockChange();
      lock.action = GeneratedWeek.LOCK;
      lock.groupId = GeneratedTestData.ids.get('Group A');
      GeneratedScheduleController.setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{ lock },
        GeneratedTestData.inputs().revision
      );
      Assert.isTrue(locksOf(draftId).contains('1'));
      Test.startTest();
      List<Object> answer = send(
        'build_week',
        menuAgain(GeneratedSaves.START_OVER, 1)
      );
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual('Started Week 1 over.', answer[1]);
      Assert.areEqual(SlotIds.OPEN, periodTwo(draftId));
      Assert.isFalse(locksOf(draftId).contains('1'));
      Assert.areEqual(new Set<String>{ 'Before Start over' }, versionsMade());
      Assert.areEqual('build', undo.get('kind'));
      Test.stopTest();
    }
  }

  // API-1.130, API-1.14: the screen's own Undo, keeping "Before Undo".
  @IsTest
  static void undoBringsBackAWeekStartedOver() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      String before = periodTwo(draftId);
      Test.startTest();
      Assert.areEqual(
        200,
        send('build_week', menuAgain(GeneratedSaves.START_OVER, 1))[0]
      );
      List<Object> undone = send('undo_last_agent_change', undoAsked());
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual('Undone: Started Week 1 over.', undone[1]);
      Assert.areEqual(before, periodTwo(draftId));
      Assert.areEqual(
        new Set<String>{ 'Before Start over', ManualVersions.BEFORE_UNDO },
        versionsMade()
      );
      Test.stopTest();
    }
  }

  private static String locksOf(Id draftId) {
    String locks = '';
    for (ScheduleDays.DayGrid day : ScheduleDays.read(draftId)) {
      locks += day.grid.locks;
    }
    return locks;
  }

  // API-1.127
  @IsTest
  static void aWeekNeverBuiltHasNoBuildMenuAndAnyOtherActionIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      for (
        String action : new List<String>{
          GeneratedSaves.TRY_ANOTHER,
          GeneratedSaves.FILL_OPEN,
          GeneratedSaves.START_OVER
        }
      ) {
        Map<String, Object> body = built();
        body.put('action', action);
        List<Object> answer = send('build_week', body);
        Assert.areEqual(400, answer[0]);
        Assert.areEqual(
          'Week 1 hasn\'t been built yet. Nothing was changed.',
          answer[1]
        );
      }
      Map<String, Object> other = built();
      other.put('action', GeneratedSaves.GENERATE);
      Assert.areEqual(400, send('build_week', other)[0]);
      Test.stopTest();
      Assert.isNull(
        GeneratedDrafts.find(
          GeneratedTestData.ids.get('Main'),
          GeneratedTestData.ids.get('Week 1')
        )
      );
    }
  }

  // API-1.127
  @IsTest
  static void aWeekSavedSinceItWasReadIsAConflictForTheBuildMenuToo() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Map<String, Object> body = menu(GeneratedSaves.START_OVER, 1);
      Integer versions = GeneratedTestData.versions();
      Test.startTest();
      body.put('revision', 'someone-else');
      List<Object> answer = send('build_week', body);
      Test.stopTest();
      Assert.areEqual(409, answer[0], String.valueOf(answer[1]));
      Assert.areEqual(versions, GeneratedTestData.versions());
      Assert.isNotNull(draft());
    }
  }

  // API-1.21, API-1.148: as on the screen, a first Generate keeps no version and has no Undo.
  @IsTest
  static void aBuildSavesThroughGeneratesSaveAndKeepsNoVersion() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Map<String, Object> body = built();
      Test.startTest();
      List<Object> answer = send('build_week', body);
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual('Built Week 1.', answer[1]);
      Id draftId = draft();
      Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
      Assert.isTrue(versionsMade().isEmpty(), versionsMade().toString());
      Assert.areEqual('none', undo.get('kind'));

      Test.stopTest();
      // The screen has no Undo for Generate: said, and nothing changed.
      List<Object> undone = send('undo_last_agent_change', undoAsked());
      Assert.areEqual(400, undone[0], String.valueOf(undone[1]));
      Assert.areEqual(
        'The screen has no Undo for "Built Week 1", so nothing was undone. It kept no version of Week 1 before it; Versions has the versions there are, and restore_version brings one back.',
        undone[1]
      );
      Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
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
      Assert.areEqual(0, GeneratedTestData.versions());
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
      Assert.areEqual('Week 1 hasn\'t been built for Main yet.', notBuilt[1]);
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
      Assert.areEqual('Not finalized. No seats are assigned yet.', noSeats[1]);
      Assert.areEqual(
        'There is no elective set called "Sports" that this user can see. The elective sets: Chugim.',
        noSuchSet[1]
      );
    }
  }
}
