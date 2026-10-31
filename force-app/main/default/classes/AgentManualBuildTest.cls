/**
 * A Manual Build week through an agent or the command line (docs/protocol/api.md API-1.41 to
 * API-1.43): the same web addresses as Generated Schedule's, each Manual Build's own server
 * action, on GeneratedTestData's camp (Week 1 of Main; a blank week holds Flagpole in Period 1
 * and Open in Period 2).
 */
@IsTest
private class AgentManualBuildTest {
  private static final String WHERE_A = 'Group A · Monday · Period 2';

  /** POST to an action on Week 1 of Main; answers [status, sentence]. */
  private static List<Object> post(String action, Map<String, Object> fields) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => [
        SELECT Name
        FROM Season__c
        WHERE Id = :GeneratedTestData.ids.get('Season')
        WITH SYSTEM_MODE
      ]
      .Name,
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
          'cell' => new AgentCell(),
          'undo' => new AgentUndo(),
          'publish' => new AgentPublish(),
          'unpublish' => new AgentUnpublish(),
          'lock' => new AgentLock(),
          'save' => new AgentSaveVersion(),
          'restore' => new AgentRestoreVersion(),
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

  private static Map<String, Object> cell(String was, String activity) {
    return new Map<String, Object>{
      'group' => 'Group A',
      'day' => 'Monday',
      'time' => 'Period 2',
      'was' => was,
      'activity' => activity
    };
  }

  private static Id manualDraft() {
    return ManualDrafts.start(
        GeneratedTestData.ids.get('Main'),
        GeneratedTestData.ids.get('Week 1')
      )
      .draftId;
  }

  private static String periodTwo(Id draftId) {
    return GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
      GeneratedTestData.PERIOD_2
    ];
  }

  private static Integer published() {
    return [
      SELECT COUNT()
      FROM Schedule__c
      WHERE Status__c = 'Published'
      WITH SYSTEM_MODE
    ];
  }

  // API-1.41
  @IsTest
  static void aWeekWithBothSchedulesIsAskedWhich() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      GeneratedTestData.generated();
      manualDraft();
      Test.startTest();
      List<Object> which = post('publish', new Map<String, Object>());
      List<Object> unknown = post(
        'publish',
        new Map<String, Object>{ 'schedule' => 'Daily View' }
      );
      List<Object> locks = post(
        'lock',
        new Map<String, Object>{
          'schedule' => 'manual build',
          'day' => 'Monday'
        }
      );
      Test.stopTest();
      Assert.areEqual(400, which[0]);
      Assert.areEqual(
        'Week 1 has a Generated Schedule and a Manual Build for Main. Say which (schedule): Generated Schedule or Manual Build.',
        which[1]
      );
      Assert.areEqual(
        'There is no schedule called "Daily View". Say Generated Schedule or Manual Build (schedule).',
        unknown[1]
      );
      Assert.areEqual(
        'Manual Build has no locks: only Generated Schedule\'s cells are locked, to keep them when the week is built again.',
        locks[1]
      );
      Assert.areEqual(0, published());
    }
  }

  // API-1.42
  @IsTest
  static void aManualCellChangeIsManualBuildsSaveAndIsUndone() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = manualDraft();
      Test.startTest();
      List<Object> stale = post('cell', cell('Gym games', 'Soccer'));
      List<Object> done = post('cell', cell('Open', 'Soccer'));
      String placed = periodTwo(draftId);
      Boolean locked = ScheduleGridLocks.isLocked(
        ScheduleDays.read(draftId)[0].grid,
        GeneratedTestData.GROUP_A,
        GeneratedTestData.PERIOD_2
      );
      List<Object> undone = post('undo', new Map<String, Object>());
      Test.stopTest();
      Assert.areEqual(409, stale[0]);
      Assert.areEqual(
        'Changed by someone else: ' +
          WHERE_A +
          ' holds Open now. Nothing was changed.',
        stale[1]
      );
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual('Placed Soccer · ' + WHERE_A + '.', done[1]);
      Assert.areEqual(GeneratedTestData.a('Soccer'), placed);
      // Manual Build's own save: it has no locks, so nothing is locked.
      Assert.isFalse(locked);
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE
            VersionReason__c = :AgentWeeks.THROUGH_AGENT
            AND Origin__c = 'Manual'
          WITH SYSTEM_MODE
        ]
      );
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual(SlotIds.OPEN, periodTwo(draftId));
    }
  }

  // API-1.43
  @IsTest
  static void publishAndUnpublishAreManualBuilds() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Map<String, Object> manual = new Map<String, Object>{
        'schedule' => 'Manual Build'
      };
      Test.startTest();
      List<Object> notStarted = post('publish', manual);
      manualDraft();
      List<Object> publish = post('publish', new Map<String, Object>());
      Integer afterPublish = published();
      List<Object> unpublish = post('unpublish', manual);
      Test.stopTest();
      Assert.areEqual(
        'Week 1 hasn\'t been started on Manual Build for Main yet. Start it there first.',
        notStarted[1]
      );
      Assert.areEqual('Published Week 1.', publish[1]);
      Assert.areEqual(1, afterPublish);
      Assert.areEqual('Unpublished Week 1.', unpublish[1]);
      Assert.areEqual(0, published());
    }
  }

  // API-1.43
  @IsTest
  static void versionsAreManualBuilds() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      manualDraft();
      Map<String, Object> named = new Map<String, Object>{
        'version' => 'Before trip'
      };
      Test.startTest();
      List<Object> save = post(
        'save',
        new Map<String, Object>{ 'name' => 'Before trip' }
      );
      List<Object> restore = post('restore', named);
      List<Object> deleted = post('delete', named);
      Test.stopTest();
      Assert.areEqual('Saved Before trip.', save[1]);
      Assert.areEqual('Restored Before trip.', restore[1]);
      Assert.areEqual('Deleted Before trip.', deleted[1]);
      // Restore kept the week first, as Manual Build's own Restore does.
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Name = :ManualVersions.BEFORE_RESTORE AND Origin__c = 'Manual'
          WITH SYSTEM_MODE
        ]
      );
    }
  }
}
