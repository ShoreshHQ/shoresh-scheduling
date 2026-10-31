/**
 * A week's versions through an agent or the command line (docs/protocol/api.md API-1.32 to
 * API-1.35): /v1/versions answers the Versions panel's own list, and save, restore, rename and
 * delete are the panel's own server actions, refused in its words, on GeneratedTestData's camp.
 * The list's words are the panel's own module (Jest shoreshVersions, connect.test.js).
 */
@IsTest
private class AgentVersionsTest {
  private static String season() {
    return [
      SELECT Name
      FROM Season__c
      WHERE Id = :GeneratedTestData.ids.get('Season')
      WITH SYSTEM_MODE
    ]
    .Name;
  }

  /** GET /v1/versions for Week 1 of Main; answers [status, body]. */
  private static List<Object> readList() {
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
    AgentVersions.get();
    return new List<Object>{
      RestContext.response.statusCode,
      JSON.deserializeUntyped(RestContext.response.responseBody.toString())
    };
  }

  /** POST to one of the panel's actions with these fields on Week 1 of Main; answers [status, sentence]. */
  private static List<Object> post(String action, Map<String, Object> fields) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => season(),
      'week' => 'Week 1',
      'program' => 'Main'
    };
    body.putAll(fields);
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentWeeks.answer(
      new Map<String, AgentWeeks.Action>{
          'save' => new AgentSaveVersion(),
          'restore' => new AgentRestoreVersion(),
          'rename' => new AgentRenameVersion(),
          'delete' => new AgentDeleteVersion()
        }
        .get(action)
    );
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  private static List<ScheduleViews.VersionRow> versions() {
    return SchedulesController.getVersions(
      GeneratedTestData.ids.get('Main'),
      GeneratedTestData.ids.get('Week 1')
    );
  }

  private static List<Schedule__c> named(String name) {
    return [
      SELECT Id, VersionReason__c
      FROM Schedule__c
      WHERE Status__c = 'Version' AND Name = :name
      WITH SYSTEM_MODE
    ];
  }

  // API-1.32
  @IsTest
  static void theListIsThePanels() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      List<Object> before = readList();
      Id draftId = GeneratedTestData.generated();
      GeneratedScheduleController.saveVersion(draftId, 'Plain');
      List<Object> after = readList();
      Test.stopTest();
      Assert.areEqual(200, before[0], String.valueOf(before[1]));
      Map<String, Object> empty = (Map<String, Object>) before[1];
      Assert.areEqual(false, empty.get('built'));
      Assert.areEqual(0, ((List<Object>) empty.get('versions')).size());
      Map<String, Object> body = (Map<String, Object>) after[1];
      Assert.areEqual('Week 1', body.get('week'));
      Assert.areEqual('Main', body.get('program'));
      Assert.areEqual(true, body.get('built'));
      Assert.areEqual(
        JSON.deserializeUntyped(JSON.serialize(versions())),
        body.get('versions')
      );
    }
  }

  // API-1.33
  @IsTest
  static void saveRenameDeleteAreThePanels() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      GeneratedTestData.generated();
      Test.startTest();
      List<Object> saved = post(
        'save',
        new Map<String, Object>{ 'name' => 'Plain' }
      );
      List<Object> blank = post(
        'save',
        new Map<String, Object>{ 'name' => ' ' }
      );
      List<Object> renamed = post(
        'rename',
        new Map<String, Object>{ 'version' => 'plain', 'name' => 'Trip week' }
      );
      List<Object> blankName = post(
        'rename',
        new Map<String, Object>{ 'version' => 'Trip week', 'name' => '' }
      );
      List<Object> deleted = post(
        'delete',
        new Map<String, Object>{ 'version' => 'Trip week' }
      );
      Test.stopTest();
      Assert.areEqual(200, saved[0], String.valueOf(saved[1]));
      Assert.areEqual('Saved Plain.', saved[1]);
      Assert.areEqual(400, blank[0]);
      Assert.areEqual('Give the version a name.', blank[1]);
      Assert.areEqual('Renamed Plain to Trip week.', renamed[1]);
      Assert.areEqual(400, blankName[0]);
      Assert.areEqual(
        'Trip week wasn\'t renamed. Give the version a name.',
        blankName[1]
      );
      Assert.areEqual('Deleted Trip week.', deleted[1]);
      Assert.isTrue(named('Trip week').isEmpty());
      Assert.isTrue(named('Plain').isEmpty());
    }
  }

  // API-1.33
  @IsTest
  static void aPublishedVersionIsKept() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      SchedulePublish.Preview first = GeneratedScheduleController.previewPublish(
        draftId
      );
      SchedulePublish.Result published = GeneratedScheduleController.publish(
        draftId,
        first.revisions,
        null
      );
      Test.startTest();
      GeneratedScheduleController.unpublish(draftId, published.published.id);
      SchedulesController.renameSchedule(versions()[0].id, 'First publish');
      List<Object> refused = post(
        'delete',
        new Map<String, Object>{ 'version' => 'First publish' }
      );
      Test.stopTest();
      Assert.areEqual(400, refused[0]);
      Assert.areEqual(
        'First publish wasn\'t deleted. "First publish" was the published schedule, which is kept as history, so it can\'t be deleted.',
        refused[1]
      );
      Assert.areEqual(1, named('First publish').size());
    }
  }

  // API-1.34
  @IsTest
  static void restoreKeepsBeforeRestore() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      List<String> asSaved = GeneratedTestData.slots(
        draftId,
        GeneratedTestData.at(0, 0)
      );
      GeneratedScheduleController.saveVersion(draftId, 'Plain');
      Test.startTest();
      List<Object> unknown = post(
        'restore',
        new Map<String, Object>{ 'version' => 'Nope' }
      );
      List<Object> restored = post(
        'restore',
        new Map<String, Object>{ 'version' => 'Plain' }
      );
      Test.stopTest();
      Assert.areEqual(400, unknown[0]);
      Assert.areEqual(200, restored[0], String.valueOf(restored[1]));
      Assert.areEqual('Restored Plain.', restored[1]);
      List<Schedule__c> kept = named(ManualVersions.BEFORE_RESTORE);
      Assert.areEqual(1, kept.size());
      Assert.areEqual(ManualVersions.AUTO_SAVED, kept[0].VersionReason__c);
      Assert.areEqual(
        asSaved,
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))
      );
    }
  }

  // API-1.33, API-1.34
  @IsTest
  static void restoreStartsAWeekNotBuilt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      SlotRunsTestData.useBlocks(
        new List<Id>{
          ids.get('Period 1'),
          ids.get('Period 2'),
          ids.get('Lunch')
        }
      );
      Id manualId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      ManualBuildController.saveVersion(manualId, 'By hand');
      Test.startTest();
      // The week has only a Manual Build, so Generated Schedule is named (API-1.41). Before the
      // week is built, the panel has no save or delete.
      List<Object> notBuilt = post(
        'delete',
        new Map<String, Object>{
          'version' => 'By hand',
          'schedule' => 'Generated Schedule'
        }
      );
      List<Object> restored = post(
        'restore',
        new Map<String, Object>{
          'version' => 'By hand',
          'schedule' => 'Generated Schedule'
        }
      );
      Test.stopTest();
      Assert.areEqual(200, restored[0], String.valueOf(restored[1]));
      Assert.areEqual(400, notBuilt[0]);
      Assert.areEqual(
        'Week 1 hasn\'t been built for Main yet. Build it first (build_week).',
        notBuilt[1]
      );
      Assert.areEqual('Restored By hand.', restored[1]);
      Assert.isNotNull(GeneratedTestData.inputs().scheduleId);
    }
  }

  // API-1.35
  @IsTest
  static void versionNamesAreNeverGuessed() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      GeneratedScheduleController.saveVersion(draftId, 'Twin');
      GeneratedScheduleController.saveVersion(draftId, 'Twin');
      Test.startTest();
      List<Object> unknown = post(
        'rename',
        new Map<String, Object>{ 'version' => 'Nope', 'name' => 'X' }
      );
      List<Object> two = post(
        'delete',
        new Map<String, Object>{ 'version' => 'twin' }
      );
      ScheduleViews.VersionRow first = versions()[0];
      List<Object> chosen = post(
        'delete',
        new Map<String, Object>{
          'version' => 'Twin',
          'saved' => AgentVersions.savedOf(first)
        }
      );
      Test.stopTest();
      Assert.areEqual(400, unknown[0]);
      Assert.areEqual(
        'There is no version called "Nope" in Week 1. Its versions: Twin.',
        unknown[1]
      );
      Assert.areEqual(400, two[0]);
      Assert.isTrue(
        ((String) two[1])
          .startsWith(
            'Week 1 has 2 versions called "Twin". Say which by when it was saved (saved), as list_versions gives it: '
          ),
        String.valueOf(two[1])
      );
      Assert.areEqual(200, chosen[0], String.valueOf(chosen[1]));
      Assert.areEqual(1, named('Twin').size());
    }
  }
}
