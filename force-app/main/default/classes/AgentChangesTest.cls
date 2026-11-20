/**
 * The person's own changes through an agent or the command line (docs/protocol/api.md API-1.11
 * to API-1.14, API-1.148): /v1/schedule_cell (the run typing works out, as the connector sends it)
 * and /v1/undo_last_agent_change (what the connector holds for the conversation) on
 * GeneratedTestData's camp, whose first Generate puts Gym games in every group's Period 2.
 */
@IsTest
private class AgentChangesTest {
  // What the last answer left for the connector to hold for Undo.
  private static Map<String, Object> undo;
  private static final String WHERE_A = 'Group A · Monday · Period 2';

  /** Week 1 of Main in the test camp's season, with more fields. */
  private static Map<String, Object> week(Map<String, Object> more) {
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
    body.putAll(more);
    return body;
  }

  /**
   * Group A's Monday Period 2 typed in with activity, as the connector sends it (one block, the
   * activity's length here): the run from what the agent saw there (was) to it.
   */
  private static Map<String, Object> cell(String was, String activity) {
    Map<String, Id> ids = GeneratedTestData.ids;
    return week(
      new Map<String, Object>{
        'change' => 'Placed ' +
        activity +
        ' · ' +
        WHERE_A,
        'said' => '',
        'runs' => new List<Object>{
          new Map<String, Object>{
            'day' => '2026-06-29',
            'groupId' => ids.get('Group A'),
            'firstBlockId' => ids.get('Period 2'),
            'blockIds' => new List<Object>{ ids.get('Period 2') },
            'before' => new List<Object>{ GeneratedTestData.a(was) },
            'after' => new List<Object>{ GeneratedTestData.a(activity) },
            'locksBefore' => new List<Object>{ '' }
          }
        }
      }
    );
  }

  /**
   * Sends body to the web address; answers [status, sentence]. A cell change hands back the week
   * as read now unless the test says what the agent saw (seen).
   */
  private static List<Object> send(String address, Map<String, Object> body) {
    if (address == 'schedule_cell' && !body.containsKey('revision')) {
      body.put('revision', GeneratedTestData.weekNow());
    }
    RestContext.request = new RestRequest();
    RestContext.request.requestURI = '/services/apexrest/v1/' + address;
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    if (address == 'schedule_cell') {
      AgentCell.post();
    } else if (address == 'unlock_cells') {
      AgentUnlock.post();
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

  private static String periodTwo(Id draftId) {
    return GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
      GeneratedTestData.PERIOD_2
    ];
  }

  /** Undo of the cell change sent, as the connector sends it after that change's answer. */
  private static Map<String, Object> undoOf(Map<String, Object> sent) {
    return week(
      new Map<String, Object>{
        'held' => AgentUndoTestCalls.held(
          AgentUndoTestCalls.editHeld(undo, (List<Object>) sent.get('runs'))
        )
      }
    );
  }

  // API-1.11, API-1.12, API-1.148
  @IsTest
  static void aCellChangeIsTheScreensHandEditAndKeepsNoVersion() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      Id draftId = GeneratedTestData.generated();
      Integer before = Limits.getQueries();
      List<Object> answer = send('schedule_cell', cell('Gym games', 'Soccer'));
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual('Placed Soccer · ' + WHERE_A + '.', answer[1]);
      Assert.areEqual(GeneratedTestData.a('Soccer'), periodTwo(draftId));
      // The screen's hand edit locks what it fills (LOCK-1.1): so does this.
      Assert.isTrue(
        ScheduleGridLocks.isLocked(
          ScheduleDays.read(draftId)[0].grid,
          GeneratedTestData.GROUP_A,
          GeneratedTestData.PERIOD_2
        )
      );
      // As on the screen, no version: what Undo needs goes back to the connector instead.
      Assert.areEqual(0, GeneratedTestData.versions());
      Assert.areEqual('edit', undo.get('kind'));
      Assert.areEqual('Placed Soccer · ' + WHERE_A, undo.get('label'));
      Assert.areEqual(String.valueOf(draftId), undo.get('schedule'));
      Assert.areEqual(GeneratedTestData.weekNow(), undo.get('seen'));
      Assert.isTrue(used < 60, 'A cell change used ' + used + ' queries');
    }
  }

  /** The screen's Lock of Group B's Monday, as Generated Schedule sends it from the week it read. */
  private static GeneratedWeek.Locked screenLocksGroupB(
    Id draftId,
    String screenRead
  ) {
    GeneratedWeek.LockChange lock = new GeneratedWeek.LockChange();
    lock.action = GeneratedWeek.LOCK;
    lock.dateValue = GeneratedTestData.MONDAY;
    lock.groupId = GeneratedTestData.ids.get('Group B');
    return GeneratedScheduleController.setLocks(
      draftId,
      new List<GeneratedWeek.LockChange>{ lock },
      screenRead
    );
  }

  // LOCK-4.8, API-1.13: AI over screen. The AI read the week, then the person locked Group B's
  // Monday; the AI's change hands back the week it read, so it is refused with nothing changed,
  // and one without seen is refused, never compared with the week read in its place.
  @IsTest
  static void anAiCellChangeFromAnOlderReadIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      String aiRead = GeneratedTestData.weekNow();
      Test.startTest();
      GeneratedWeek.Locked screen = screenLocksGroupB(draftId, aiRead);
      Map<String, Object> asked = cell('Gym games', 'Soccer');
      asked.put('revision', aiRead);
      List<Object> answer = send('schedule_cell', asked);
      asked.put('revision', null);
      List<Object> unseen = send('schedule_cell', asked);
      Test.stopTest();
      Assert.isFalse(screen.conflict, 'Screen lock: ' + screen.message);
      Assert.areEqual(409, answer[0], 'AI change: ' + answer[1]);
      Assert.areEqual(ScheduleDaySaves.CHANGED_SINCE, answer[1]);
      Assert.areEqual(400, unseen[0], 'No seen: never read in its place');
      Assert.areEqual(AgentSchedules.SAY_SEEN, unseen[1]);
      Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
      Assert.areEqual(0, GeneratedTestData.versions());
    }
  }

  // LOCK-4.8: screen over AI. The person read the week, then the AI changed a cell; the
  // screen's Lock from its older read is a conflict, so it never builds on a week it didn't see.
  @IsTest
  static void aScreenChangeAfterAnAiCellChangeIsAConflict() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      String screenRead = GeneratedTestData.weekNow();
      Test.startTest();
      List<Object> answer = send('schedule_cell', cell('Gym games', 'Soccer'));
      GeneratedWeek.Locked screen = screenLocksGroupB(draftId, screenRead);
      Test.stopTest();
      Assert.areEqual(200, answer[0], 'AI change: ' + answer[1]);
      Assert.isTrue(screen.conflict, 'The screen read the week before');
      Assert.areEqual(GeneratedTestData.a('Soccer'), periodTwo(draftId));
    }
  }

  // API-1.13
  @IsTest
  static void aCellSomeoneElseChangedIsAConflictWithTheScreensWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      Id draftId = GeneratedTestData.generated();
      // The agent saw Soccer there; the cell holds Gym games.
      List<Object> answer = send('schedule_cell', cell('Soccer', 'Swim'));
      Test.stopTest();
      Assert.areEqual(409, answer[0], String.valueOf(answer[1]));
      Assert.areEqual(
        'Changed by someone else since you read the week: Placed Swim · ' +
          WHERE_A +
          '. Nothing was changed.',
        answer[1]
      );
      Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
      Assert.areEqual(0, GeneratedTestData.versions());
    }
  }

  // API-1.13
  @IsTest
  static void aLockTheRunDidntSeeIsNeverCovered() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Test.startTest();
      Id draftId = GeneratedTestData.generated();
      GeneratedWeek.LockChange lock = new GeneratedWeek.LockChange();
      lock.action = GeneratedWeek.LOCK;
      lock.dateValue = GeneratedTestData.MONDAY;
      lock.groupId = ids.get('Group A');
      lock.blockId = ids.get('Period 2');
      GeneratedScheduleController.setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{ lock },
        GeneratedDrafts.revisionOf(ScheduleDays.read(draftId))
      );
      List<Object> answer = send('schedule_cell', cell('Gym games', 'Soccer'));
      Test.stopTest();
      // The connector refuses it first in the screen's words ("... is locked."); a run that
      // didn't see the lock is never made over it.
      Assert.areEqual(409, answer[0]);
      Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
      Assert.areEqual(0, GeneratedTestData.versions());
    }
  }

  // API-1.14: Undo is the screen's: the runs back through the same save, no version kept, once.
  @IsTest
  static void undoSendsTheRunsBackAndKeepsNoVersion() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      Map<String, Object> sent = cell('Gym games', 'Soccer');
      send('schedule_cell', sent);
      Map<String, Object> asked = undoOf(sent);
      List<Object> undone = send('undo_last_agent_change', asked);
      Map<String, Object> left = undo;
      Boolean locked = ScheduleGridLocks.isLocked(
        ScheduleDays.read(draftId)[0].grid,
        GeneratedTestData.GROUP_A,
        GeneratedTestData.PERIOD_2
      );
      // Taken back: the connector holds nothing more for the week, as a page's Undo spent.
      List<Object> again = send(
        'undo_last_agent_change',
        week(new Map<String, Object>{ 'held' => new Map<String, Object>() })
      );
      Test.stopTest();
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual('Undone: Placed Soccer · ' + WHERE_A + '.', undone[1]);
      Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
      Assert.isFalse(locked, 'The lock the edit made is taken back with it');
      Assert.areEqual(0, GeneratedTestData.versions());
      Assert.areEqual('undone', left.get('kind'));
      Assert.areEqual(400, again[0]);
      Assert.isTrue(
        String.valueOf(again[1])
          .startsWith(
            'Nothing to undo: this conversation hasn\'t changed Week 1 (Generated Schedule).'
          ),
        String.valueOf(again[1])
      );
    }
  }

  // API-1.14: an Unlock between a change and its Undo, as on the screen: its answer says the week
  // as it left it and what it chose, and the Undo the connector then sends (the runs back, from
  // the week the Unlock left) is made.
  @IsTest
  static void undoGoesOnPastALockAsOnTheScreen() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      Map<String, Object> sent = cell('Gym games', 'Soccer');
      send('schedule_cell', sent);
      Map<String, Object> edit = undo;
      // The edit locked the cell (a hand edit is a lock); the person then unlocks it.
      List<Object> locked = send(
        'unlock_cells',
        week(
          new Map<String, Object>{
            'day' => 'Monday',
            'group' => 'Group A',
            'time' => 'Period 2',
            'seen' => GeneratedTestData.weekNow()
          }
        )
      );
      Map<String, Object> lock = undo;
      // The connector's Undo: the edit, from the week as the Unlock left it (its locks now, and
      // the cell the Unlock chose left unlocked).
      Map<String, Object> held = AgentUndoTestCalls.editHeld(
        edit,
        (List<Object>) sent.get('runs')
      );
      held.put('seen', lock.get('seen'));
      List<Object> undone = send(
        'undo_last_agent_change',
        week(new Map<String, Object>{ 'held' => AgentUndoTestCalls.held(held) })
      );
      Test.stopTest();
      Assert.areEqual(200, locked[0], String.valueOf(locked[1]));
      Assert.areEqual('Unlocked Group A · Monday · Period 2.', locked[1]);
      Assert.areEqual('lock', lock.get('kind'));
      Assert.areEqual(GeneratedWeek.UNLOCK, lock.get('action'));
      Assert.areEqual(
        String.valueOf(GeneratedTestData.ids.get('Period 2')),
        lock.get('blockId')
      );
      Assert.areEqual('2026-06-29', lock.get('dateValue'));
      Assert.areEqual(
        String.valueOf(GeneratedTestData.ids.get('Group A')),
        lock.get('groupId')
      );
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
      Assert.isFalse(
        ScheduleGridLocks.isLocked(
          ScheduleDays.read(draftId)[0].grid,
          GeneratedTestData.GROUP_A,
          GeneratedTestData.PERIOD_2
        ),
        'The cell the Unlock chose stays unlocked'
      );
      Assert.areEqual(0, GeneratedTestData.versions());
    }
  }

  // API-1.14
  @IsTest
  static void undoNeverTakesBackSomeoneElsesNewerChange() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      SlotRunsTestData.useBlocks(
        new List<Id>{
          ids.get('Period 1'),
          ids.get('Period 2'),
          ids.get('Lunch')
        }
      );
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      Map<String, Object> sent = cell('Gym games', 'Soccer');
      send('schedule_cell', sent);
      Map<String, Object> asked = undoOf(sent);
      // Then a hand edit on screen, of Group B's Monday Period 2.
      GeneratedTestData.handEdits(
        draftId,
        new List<SlotEdits.Edit>{
          SlotRunsTestData.edit(
            SlotRunsTestData.at(
              GeneratedTestData.MONDAY,
              ids.get('Group B'),
              ids.get('Period 2')
            ),
            new List<String>{ GeneratedTestData.a('Gym games') },
            new List<String>{ '' }
          )
        },
        GeneratedDrafts.revisionOf(ScheduleDays.read(draftId))
      );
      List<Object> undone = send('undo_last_agent_change', asked);
      Test.stopTest();
      Assert.areEqual(409, undone[0]);
      Assert.areEqual(ScheduleDaySaves.CHANGED_SINCE, undone[1]);
      Assert.areEqual(GeneratedTestData.a('Soccer'), periodTwo(draftId));
    }
  }

  // API-1.11: the person's own access, no more
  @IsTest
  static void someoneWithoutShoreshChangesNothing() {
    Id draftId;
    Map<String, Object> asked;
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      draftId = GeneratedTestData.generated();
      asked = cell('Gym games', 'Soccer');
    }
    System.runAs(ShoreshTestData.outsider()) {
      Test.startTest();
      List<Object> answer = send('schedule_cell', asked);
      Test.stopTest();
      Assert.areEqual(400, answer[0]);
      Assert.areEqual(
        'You can\'t change schedules in Shoresh. A Salesforce admin can give you the "Shoresh Scheduler" permission set.',
        answer[1]
      );
    }
    Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
  }

  // API-1.13
  @IsTest
  static void aChangedCellLosesItsBuildReasonAsOnScreen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      String monday = String.valueOf(GeneratedTestData.MONDAY);
      Database.update(
        new Schedule__c(
          Id = draftId,
          EngineNotes__c = JSON.serialize(
            new Map<String, Object>{
              'v' => 1,
              'open' => new List<Object>{
                new List<String>{
                  monday,
                  ids.get('Group A'),
                  ids.get('Period 2'),
                  'full'
                },
                new List<String>{
                  monday,
                  ids.get('Group B'),
                  ids.get('Period 2'),
                  'full'
                }
              },
              'blank' => new List<Object>(),
              'floor' => new Map<String, Object>{ 'kind' => 'frame' }
            }
          )
        ),
        AccessLevel.USER_MODE
      );
      Test.startTest();
      List<Object> answer = send('schedule_cell', cell('Gym games', 'Soccer'));
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Map<String, Object> notes = (Map<String, Object>) JSON.deserializeUntyped(
        [
          SELECT EngineNotes__c
          FROM Schedule__c
          WHERE Id = :draftId
          WITH SYSTEM_MODE
        ]
        .EngineNotes__c
      );
      List<Object> open = (List<Object>) notes.get('open');
      Assert.areEqual(1, open.size());
      Assert.areEqual(ids.get('Group B'), ((List<Object>) open[0])[1]);
      Assert.isNull(notes.get('floor'));
    }
  }

  // API-1.13
  @IsTest
  static void lookAlikeNamesAreRefusedNamingBoth() {
    Assert.areEqual(
      1,
      AgentFields.onlyOne(
        new List<String>{ 'Bunk 1', 'Bunk 2' },
        'bunk 2',
        'a group'
      )
    );
    Assert.areEqual(
      -1,
      AgentFields.onlyOne(new List<String>{ 'Bunk 1' }, '', 'a group')
    );
    try {
      AgentFields.onlyOne(
        new List<String>{ 'Bunk 1', 'bunk  1' },
        'Bunk 1',
        'a group'
      );
      Assert.fail('Expected look-alike names to be refused');
    } catch (ShoreshException e) {
      Assert.areEqual(
        '"Bunk 1" and "bunk  1" are both a group called that on that day, so Shoresh can\'t tell which you mean. Nothing was changed.',
        e.getMessage()
      );
    }
  }
}
