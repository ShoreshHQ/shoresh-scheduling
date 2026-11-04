/**
 * Unpublish, Lock and Unlock through an agent or the command line (docs/protocol/api.md API-1.36,
 * API-1.37): each is Generated Schedule's own server action, answered and refused in the screen's
 * words, on GeneratedTestData's camp (Week 1 of Main; Gym games in every Period 2, Flagpole fixed
 * in Period 1).
 */
@IsTest
private class AgentUnpublishLockTest {
  /**
   * POST to unpublish_week, lock_cells or unlock_cells on Week 1 of Main; answers [status,
   * sentence]. A lock or unlock without its own seen hands back the week as it is now (read just
   * before, as read_week_checks would read it).
   */
  private static List<Object> post(String action, Map<String, Object> fields) {
    if (action != 'unpublish' && !fields.containsKey('seen')) {
      fields = fields.clone();
      fields.put('seen', GeneratedTestData.weekNow());
    }
    return send(action, fields);
  }

  private static List<Object> send(String action, Map<String, Object> fields) {
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
    if (action == 'unlock_cells') {
      // The web address itself, as an AI reaches it.
      AgentUnlock.post();
    } else {
      AgentWeeks.answer(
        new Map<String, AgentWeeks.Action>{
            'unpublish' => new AgentUnpublish(),
            'lock' => new AgentLock(),
            'unlock' => new AgentLock(GeneratedWeek.UNLOCK)
          }
          .get(action)
      );
    }
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
      Assert.areEqual('Week 1 hasn\'t been built for Main yet.', refused[1]);
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
        new Map<String, Object>{ 'day' => 'Monday', 'group' => 'all' }
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
        new Map<String, Object>{ 'day' => 'Monday', 'group' => 'ALL' }
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
        new Map<String, Object>{ 'group' => 'Group Z', 'day' => 'all' }
      );
      Test.stopTest();
      Assert.areEqual(400, none[0]);
      Assert.areEqual(
        'Nothing was changed: say which group (group) to lock, or "all" for every group.',
        none[1]
      );
      Assert.areEqual(
        'Nothing was changed: say which group (group) to lock, or "all" for every group.',
        timeOnly[1]
      );
      Assert.areEqual(
        'There is no group called "Group Z" in this schedule. The groups: Group A, Group B, Group C.',
        noGroup[1]
      );
    }
  }

  // API-1.107: "Lock Bunk 2's Tuesday" sent without its group is refused naming what is missing,
  // never read as every group's Tuesday; every group and every day only when said ("all").
  @IsTest
  static void aLockScopeLeftOutIsRefusedNeverWidened() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      List<Object> noGroup = post(
        'lock',
        new Map<String, Object>{ 'day' => 'Monday' }
      );
      List<Object> noDay = post(
        'unlock',
        new Map<String, Object>{ 'group' => 'Group A' }
      );
      List<Object> wholeWeek = post(
        'lock',
        new Map<String, Object>{ 'day' => 'all', 'group' => 'all' }
      );
      Test.stopTest();
      Assert.areEqual(400, noGroup[0]);
      Assert.areEqual(
        'Nothing was changed: say which group (group) to lock, or "all" for every group.',
        noGroup[1]
      );
      Assert.areEqual(
        'Nothing was changed: say which day (day) to unlock, or "all" for every day.',
        noDay[1]
      );
      Assert.areEqual(400, wholeWeek[0]);
      Assert.isFalse(
        locked(draftId, GeneratedTestData.GROUP_B, GeneratedTestData.PERIOD_2),
        'Nothing was locked'
      );
    }
  }

  // API-1.37: the unlock web address itself. Monday is locked; an unlock without seen, or from a
  // read made before the lock, changes nothing; one from the week as it is unlocks only Group A's
  // Monday.
  @IsTest
  static void unlockCellsIsItsOwnWebAddress() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      String beforeLock = GeneratedTestData.weekNow();
      post(
        'lock',
        new Map<String, Object>{ 'day' => 'Monday', 'group' => 'all' }
      );
      Map<String, Object> groupADay = new Map<String, Object>{
        'group' => 'Group A',
        'day' => 'Monday'
      };
      Test.startTest();
      List<Object> unseen = send('unlock_cells', groupADay);
      Map<String, Object> stale = groupADay.clone();
      stale.put('seen', beforeLock);
      List<Object> old = send('unlock_cells', stale);
      Boolean stillLocked = locked(
        draftId,
        GeneratedTestData.GROUP_A,
        GeneratedTestData.PERIOD_2
      );
      List<Object> unlocked = post('unlock_cells', groupADay);
      Test.stopTest();
      Assert.areEqual(400, unseen[0], String.valueOf(unseen[1]));
      Assert.isTrue(
        ((String) unseen[1]).contains('(seen)'),
        String.valueOf(unseen[1])
      );
      Assert.areEqual(409, old[0], String.valueOf(old[1]));
      Assert.areEqual(ScheduleDaySaves.CHANGED_SINCE, old[1]);
      Assert.isTrue(stillLocked, 'A refused unlock changes nothing');
      Assert.areEqual(200, unlocked[0], String.valueOf(unlocked[1]));
      Assert.areEqual('Unlocked Group A · Monday.', unlocked[1]);
      Assert.isFalse(
        locked(draftId, GeneratedTestData.GROUP_A, GeneratedTestData.PERIOD_2)
      );
      Assert.isTrue(
        locked(draftId, GeneratedTestData.GROUP_B, GeneratedTestData.PERIOD_2),
        'Only Group A\'s Monday is unlocked'
      );
    }
  }

  // API-1.37, LOCK-4.7: AI over screen. The AI read the week, then the person locked a cell on
  // Generated Schedule; the AI's unlock of that group's day hands back the week it read, so it is
  // refused and the person's lock stays.
  @IsTest
  static void anAiUnlockMadeFromAnOlderReadLeavesThePersonsLock() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      String aiRead = GeneratedTestData.weekNow();
      GeneratedWeek.LockChange screenLock = new GeneratedWeek.LockChange();
      screenLock.action = GeneratedWeek.LOCK;
      screenLock.dateValue = ScheduleDays.read(draftId)[0].day;
      screenLock.groupId = String.valueOf(
        [
          SELECT Id
          FROM Group__c
          WHERE Name = 'Group A'
          WITH SYSTEM_MODE
          LIMIT 1
        ]
        .Id
      );
      Test.startTest();
      GeneratedWeek.Locked screen = GeneratedScheduleController.setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{ screenLock },
        aiRead
      );
      List<Object> unlock = post(
        'unlock',
        new Map<String, Object>{
          'group' => 'Group A',
          'day' => 'Monday',
          'seen' => aiRead
        }
      );
      List<Object> unseen = send(
        'unlock',
        new Map<String, Object>{ 'group' => 'Group A', 'day' => 'Monday' }
      );
      Test.stopTest();
      Assert.isFalse(screen.conflict, 'Screen lock: ' + screen.message);
      Assert.areEqual(409, unlock[0], 'Unlock: ' + unlock[1]);
      Assert.areEqual(ScheduleDaySaves.CHANGED_SINCE, unlock[1]);
      Assert.areEqual(400, unseen[0], 'No seen: never read in its place');
      Assert.isTrue(((String) unseen[1]).contains('(seen)'));
      Assert.isTrue(
        locked(draftId, GeneratedTestData.GROUP_A, GeneratedTestData.PERIOD_2),
        'The person\'s lock stays'
      );
    }
  }
}
