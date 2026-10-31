/**
 * Unpublish, Lock and Unlock through an agent or the command line (docs/protocol/api.md API-1.36,
 * API-1.37): each is Generated Schedule's own server action, answered and refused in the screen's
 * words, on GeneratedTestData's camp (Week 1 of Main; Gym games in every Period 2, Flagpole fixed
 * in Period 1).
 */
@IsTest
private class AgentUnpublishLockTest {
  /** POST to unpublish_week, lock_cells or unlock_cells on Week 1 of Main; answers [status, sentence]. */
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
          'unpublish' => new AgentUnpublish(),
          'lock' => new AgentLock(),
          'unlock' => new AgentLock(GeneratedWeek.UNLOCK)
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

  private static Integer published() {
    return [
      SELECT COUNT()
      FROM Schedule__c
      WHERE Status__c = 'Published'
      WITH SYSTEM_MODE
    ];
  }

  /** Whether Group's cell (by position) on Monday is locked. */
  private static Boolean locked(Id draftId, Integer g, Integer b) {
    return ScheduleGridLocks.isLocked(ScheduleDays.read(draftId)[0].grid, g, b);
  }

  // API-1.36
  @IsTest
  static void unpublishIsTheScreens() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      SchedulePublish.Preview preview = GeneratedScheduleController.previewPublish(
        draftId
      );
      GeneratedScheduleController.publish(draftId, preview.revisions, null);
      Test.startTest();
      List<Object> done = post('unpublish', new Map<String, Object>());
      List<Object> again = post('unpublish', new Map<String, Object>());
      Test.stopTest();
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual('Unpublished Week 1.', done[1]);
      Assert.areEqual(0, published());
      Assert.areEqual(
        'Week 1 isn\'t published, so there is nothing to unpublish.',
        again[1]
      );
      // The schedule it had is kept as a version marked Published, as on screen.
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Status__c = 'Version' AND PublishedAt__c != NULL
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  // API-1.36
  @IsTest
  static void unpublishNeedsABuiltWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      List<Object> refused = post('unpublish', new Map<String, Object>());
      Test.stopTest();
      Assert.areEqual(400, refused[0]);
      Assert.areEqual(
        'Week 1 hasn\'t been built for Main yet. Build it first (build_week).',
        refused[1]
      );
    }
  }

  // API-1.37
  @IsTest
  static void lockAndUnlockAreTheMenus() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      List<Object> cell = post(
        'lock',
        new Map<String, Object>{
          'day' => 'Monday',
          'group' => 'group a',
          'time' => 'Period 2'
        }
      );
      Boolean cellLocked = locked(
        draftId,
        GeneratedTestData.GROUP_A,
        GeneratedTestData.PERIOD_2
      );
      Boolean otherLocked = locked(
        draftId,
        GeneratedTestData.GROUP_B,
        GeneratedTestData.PERIOD_2
      );
      List<Object> day = post(
        'lock',
        new Map<String, Object>{ 'day' => 'Monday' }
      );
      Boolean dayLocked = locked(
        draftId,
        GeneratedTestData.GROUP_B,
        GeneratedTestData.PERIOD_2
      );
      Boolean fixedLocked = locked(
        draftId,
        GeneratedTestData.GROUP_B,
        GeneratedTestData.PERIOD_1
      );
      List<Object> nothing = post(
        'lock',
        new Map<String, Object>{ 'day' => 'Monday' }
      );
      List<Object> groupDay = post(
        'unlock',
        new Map<String, Object>{ 'group' => 'Group B', 'day' => 'Monday' }
      );
      Test.stopTest();
      Assert.areEqual(200, cell[0], String.valueOf(cell[1]));
      Assert.areEqual('Locked Group A · Monday · Period 2.', cell[1]);
      Assert.isTrue(cellLocked);
      Assert.isFalse(otherLocked);
      Assert.areEqual('Locked Monday.', day[1]);
      Assert.isTrue(dayLocked);
      Assert.isFalse(fixedLocked, 'A fixed activity is never locked');
      Assert.areEqual(200, nothing[0]);
      Assert.isTrue(
        ((String) nothing[1]).startsWith('Nothing in Monday to lock')
      );
      Assert.areEqual('Unlocked Group B · Monday.', groupDay[1]);
      Assert.isFalse(
        locked(draftId, GeneratedTestData.GROUP_B, GeneratedTestData.PERIOD_2)
      );
      Assert.isTrue(
        locked(draftId, GeneratedTestData.GROUP_A, GeneratedTestData.PERIOD_2)
      );
    }
  }

  // API-1.37
  @IsTest
  static void lockNamesAreNeverGuessed() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      GeneratedTestData.generated();
      Test.startTest();
      List<Object> none = post('lock', new Map<String, Object>());
      List<Object> timeOnly = post(
        'lock',
        new Map<String, Object>{ 'time' => 'Period 2', 'day' => 'Monday' }
      );
      List<Object> noGroup = post(
        'unlock',
        new Map<String, Object>{ 'group' => 'Group Z' }
      );
      Test.stopTest();
      Assert.areEqual(400, none[0]);
      Assert.areEqual(
        'Say what to lock: a day (day), a group (group), a group\'s day (group and day), or one cell (day, group and time).',
        none[1]
      );
      Assert.areEqual(
        'One cell is a day, a group and a time: say all three (day, group, time).',
        timeOnly[1]
      );
      Assert.areEqual(
        'There is no group called "Group Z" in this schedule. The groups: Group A, Group B, Group C.',
        noGroup[1]
      );
    }
  }
}
