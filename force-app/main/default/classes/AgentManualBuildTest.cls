/**
 * A Manual Build week through an agent or the command line (docs/protocol/api.md API-1.41 to
 * API-1.46): the same web addresses as Generated Schedule's, each Manual Build's own server
 * action, on GeneratedTestData's camp (Week 1 of Main; a blank week holds Flagpole in Period 1
 * and Open in Period 2).
 */
@IsTest
private class AgentManualBuildTest {
  // What the last answer left for the connector to hold for Undo.
  private static Map<String, Object> undo;
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
    if (action == 'clear') {
      // Its own web address, as the connector sends it.
      AgentClearCells.post();
    } else {
      AgentAskFirstTestCalls.answer(
        new Map<String, AgentRequest.Change>{
            'cell' => new AgentCells(),
            'undo' => new AgentUndo(),
            'publish' => new AgentPublish(),
            'unpublish' => new AgentUnpublish(),
            'lock' => new AgentLock(),
            'save' => new AgentSaveVersion(),
            'restore' => new AgentRestoreVersion(),
            'delete' => new AgentDeleteVersion(),
            'move' => new AgentCells(),
            'clear yes' => new AgentClearCells.Clear(),
            'accept' => new AgentAccept(),
            'start' => new AgentStartWeek()
          }
          .get(action)
      );
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

  /**
   * Group A's Monday Period 2 typed in, as the connector sends it: the run from the slot the
   * agent saw there (was) to the slot typed (one block), with no locks, as Manual Build sends it.
   */
  private static Map<String, Object> cell(
    String was,
    String slot,
    String name
  ) {
    Map<String, Id> ids = GeneratedTestData.ids;
    return new Map<String, Object>{
      'change' => 'Placed ' +
      name +
      ' · ' +
      WHERE_A,
      'said' => '',
      'runs' => new List<Object>{
        new Map<String, Object>{
          'day' => '2026-06-29',
          'groupId' => ids.get('Group A'),
          'firstBlockId' => ids.get('Period 2'),
          'blockIds' => new List<Object>{ ids.get('Period 2') },
          'before' => new List<Object>{ was },
          'after' => new List<Object>{ slot }
        }
      }
    };
  }

  /** Undo of the edit sent, as the connector sends it after that edit's answer. */
  private static Map<String, Object> undoOf(Map<String, Object> sent) {
    return new Map<String, Object>{
      'held' => AgentUndoTestCalls.held(
        AgentUndoTestCalls.manualHeld(undo, (List<Object>) sent.get('runs'))
      )
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
  // API-1.124: an AI puts an elective set on a cell, as the drawer does: the screen's own save,
  // read back as that set (the connector finds it by name, refusing a name an activity also has:
  // screenUndo.test.js and connect.test.js).
  @IsTest
  static void anElectiveSetGoesOnACellAsTheDrawerPutsIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id seasonId = GeneratedTestData.ids.get('Season');
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = seasonId,
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      Id draftId = manualDraft();
      Test.startTest();
      List<Object> done = post('cell', cell('', 'E:' + chugim.Id, 'Chugim'));
      Test.stopTest();
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual('Placed Chugim · ' + WHERE_A + '.', done[1]);
      ScheduleGrid grid = ScheduleDays.read(draftId)[0].grid;
      ScheduleGrid.Item placed = grid.items[grid.items.size() - 1];
      Assert.areEqual('E', placed.kind);
      Assert.areEqual(String.valueOf(chugim.Id), placed.id);
    }
  }

  @IsTest
  static void aManualCellChangeIsManualBuildsSaveAndIsUndone() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = manualDraft();
      Test.startTest();
      String soccer = GeneratedTestData.a('Soccer');
      List<Object> stale = post(
        'cell',
        cell(GeneratedTestData.a('Gym games'), soccer, 'Soccer')
      );
      Map<String, Object> sent = cell('', soccer, 'Soccer');
      List<Object> done = post('cell', sent);
      String placed = periodTwo(draftId);
      Boolean locked = ScheduleGridLocks.isLocked(
        ScheduleDays.read(draftId)[0].grid,
        GeneratedTestData.GROUP_A,
        GeneratedTestData.PERIOD_2
      );
      Integer versions = GeneratedTestData.versions();
      List<Object> undone = post('undo', undoOf(sent));
      Test.stopTest();
      Assert.areEqual(409, stale[0]);
      Assert.areEqual(
        'Changed by someone else since you read the week: Placed Soccer · ' +
          WHERE_A +
          '. Nothing was changed.',
        stale[1]
      );
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual('Placed Soccer · ' + WHERE_A + '.', done[1]);
      Assert.areEqual(GeneratedTestData.a('Soccer'), placed);
      // Manual Build's own save: it has no locks, so nothing is locked.
      Assert.isFalse(locked);
      // As on the screen, no version is kept, and Undo keeps none either (API-1.148).
      Assert.areEqual(0, versions);
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual('Undone: Placed Soccer · ' + WHERE_A + '.', undone[1]);
      Assert.areEqual(SlotIds.OPEN, periodTwo(draftId));
      Assert.areEqual(0, GeneratedTestData.versions());
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
        'Week 1 hasn\'t been started on Manual Build for Main yet.',
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

  /** GET /v1/week_checks for Week 1 of Main on Manual Build; answers [status, body]. */
  private static List<Object> readChecks() {
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
        'program' => 'Main',
        'schedule' => 'Manual Build'
      }
    );
    RestContext.response = new RestResponse();
    AgentChecks.get();
    return new List<Object>{
      RestContext.response.statusCode,
      JSON.deserializeUntyped(RestContext.response.responseBody.toString())
    };
  }

  // API-1.44
  @IsTest
  static void manualChecksReadManualBuildsDraftAndAcceptThere() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      List<Object> notStarted = readChecks();
      Id draftId = manualDraft();
      Test.startTest();
      List<Object> read = readChecks();
      List<Object> accepted = post(
        'accept',
        new Map<String, Object>{
          'line' => new Map<String, Object>{
            'k' => 'under|a1|2|4',
            's' => 'under|a1',
            'n' => 2
          }
        }
      );
      Test.stopTest();
      Assert.areEqual(400, notStarted[0]);
      Assert.areEqual(
        'Week 1 hasn\'t been started on Manual Build for Main yet.',
        ((Map<String, Object>) notStarted[1]).get('message')
      );
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Map<String, Object> body = (Map<String, Object>) read[1];
      Assert.areEqual(
        new Set<String>{
          'draft',
          'setup',
          'labels',
          'setup_changes',
          'accepted',
          'season',
          'week_name'
        },
        body.keySet()
      );
      Map<String, Object> schedule = (Map<String, Object>) ((Map<String, Object>) body.get(
          'draft'
        ))
        .get('schedule');
      Assert.areEqual(
        String.valueOf(draftId),
        ((Map<String, Object>) schedule.get('schedule')).get('id')
      );
      Assert.areEqual('Accepted.', accepted[1]);
      List<Object> lines = (List<Object>) JSON.deserializeUntyped(
        WeekAccepts.accepted(draftId)
      );
      Assert.areEqual(1, lines.size());
    }
  }

  // API-1.45
  @IsTest
  static void manualCellsAreManualBuildsSaveAndUndone() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = manualDraft();
      Map<String, Id> ids = GeneratedTestData.ids;
      String soccer = GeneratedTestData.a('Soccer');
      Map<String, Object> run = new Map<String, Object>{
        'day' => '2026-06-29',
        'groupId' => ids.get('Group A'),
        'firstBlockId' => ids.get('Period 2'),
        'blockIds' => new List<Object>{ ids.get('Period 2') },
        'before' => new List<Object>{ '' },
        'after' => new List<Object>{ soccer }
      };
      Map<String, Object> edit = new Map<String, Object>{
        'change' => 'Pasted 1 activity · ' + WHERE_A,
        'said' => '',
        'runs' => new List<Object>{ run }
      };
      Test.startTest();
      List<Object> done = post('move', edit);
      Map<String, Object> asked = undoOf(edit);
      String placed = periodTwo(draftId);
      List<Object> stale = post('move', edit);
      List<Object> undone = post('undo', asked);
      Test.stopTest();
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual('Pasted 1 activity · ' + WHERE_A + '.', done[1]);
      Assert.areEqual(soccer, placed);
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(
        'Changed by someone else since you read the week: Pasted 1 activity · ' +
          WHERE_A +
          '. Nothing was changed.',
        stale[1]
      );
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual(SlotIds.OPEN, periodTwo(draftId));
    }
  }

  // WEEK-6.14, WEEK-6.15, API-1.143
  @IsTest
  static void aClearAsksFirstThenKeepsTheWeekAsBeforeClear() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = manualDraft();
      Map<String, Id> ids = GeneratedTestData.ids;
      String soccer = GeneratedTestData.a('Soccer');
      Map<String, Object> run = new Map<String, Object>{
        'day' => '2026-06-29',
        'groupId' => ids.get('Group A'),
        'firstBlockId' => ids.get('Period 2'),
        'blockIds' => new List<Object>{ ids.get('Period 2') },
        'before' => new List<Object>{ '' },
        'after' => new List<Object>{ soccer }
      };
      post(
        'move',
        new Map<String, Object>{
          'change' => 'Pasted 1 activity · ' + WHERE_A,
          'said' => '',
          'runs' => new List<Object>{ run.clone() }
        }
      );
      run.put('before', new List<Object>{ soccer });
      run.put('after', new List<Object>{ '' });
      Map<String, Object> clear = new Map<String, Object>{
        'change' => 'Cleared Monday',
        'said' => '',
        'runs' => new List<Object>{ run },
        'preview' => new List<Object>{
          'Group A · Monday: Soccer',
          'The week as it is now is kept in Versions as "Before Clear Monday".'
        }
      };
      Test.startTest();
      // Sent without the person's yes: nothing is done, and the screen's preview is said.
      List<Object> asked = post('clear', clear.clone());
      String askedSoccer = periodTwo(draftId);
      Integer before = Limits.getQueries();
      List<Object> done = post('clear yes', clear);
      Integer used = Limits.getQueries() - before;
      Map<String, Object> clearUndo = undo;
      List<Object> unreadable = post(
        'clear',
        new Map<String, Object>{
          'change' => 'Moved Soccer',
          'said' => '',
          'runs' => new List<Object>{ run }
        }
      );
      Test.stopTest();
      Assert.areEqual(200, asked[0], String.valueOf(asked[1]));
      Assert.areEqual(
        'Nothing has been done yet. This clears Monday in Week 1 (Main, ' +
          ManualDrafts.NAME +
          '). Group A · Monday: Soccer. The week as it is now is kept in Versions as "Before Clear Monday".',
        asked[1]
      );
      Assert.areEqual(soccer, askedSoccer, 'nothing cleared before the yes');
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual(
        'Cleared Monday. The week as it was is kept in Versions as "Before Clear Monday".',
        done[1]
      );
      Assert.areNotEqual(soccer, periodTwo(draftId));
      List<Schedule__c> kept = [
        SELECT Id, Name, VersionReason__c
        FROM Schedule__c
        WHERE SourceSchedule__c = :draftId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(1, kept.size(), 'one version kept, as on screen');
      Assert.areEqual('Before Clear Monday', kept[0].Name);
      Assert.areEqual(ManualVersions.AUTO_SAVED, kept[0].VersionReason__c);
      // What was cleared is in it.
      Assert.areEqual(soccer, periodTwo(kept[0].Id));
      Assert.areEqual('Before Clear Monday', clearUndo.get('version_name'));
      // Asked and confirmed, as the person's yes sends it again.
      Assert.isTrue(used < 70, 'A clear used ' + used + ' queries');
      // Only a clear keeps a version here; anything else sent here is refused.
      Assert.areEqual(400, unreadable[0], String.valueOf(unreadable[1]));
    }
  }

  // API-1.46
  @IsTest
  static void startingAWeekIsTheScreensStart() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      List<Object> blank = post('start', new Map<String, Object>());
      List<Object> again = post('start', new Map<String, Object>());
      Test.startTest();
      List<Object> unknown = post(
        'start',
        new Map<String, Object>{ 'week' => 'Week 2', 'from_week' => 'Week 9' }
      );
      List<Object> fromWeek = post(
        'start',
        new Map<String, Object>{ 'week' => 'Week 2', 'from_week' => 'week 1' }
      );
      Test.stopTest();
      Assert.areEqual(200, blank[0], String.valueOf(blank[1]));
      Assert.isTrue(
        ((String) blank[1]).startsWith('Started Week 1.'),
        String.valueOf(blank[1])
      );
      Assert.isNotNull(
        ManualDrafts.find(
          GeneratedTestData.ids.get('Main'),
          GeneratedTestData.ids.get('Week 1')
        )
      );
      Assert.areEqual(400, again[0]);
      Assert.areEqual(
        'Week 1 has already been started on Manual Build for Main.',
        again[1]
      );
      Assert.areEqual(400, unknown[0]);
      Assert.areEqual(
        'There is nothing called "Week 9" to start from. What it can start from: Week 1 · Manual Build.',
        unknown[1]
      );
      Assert.areEqual(200, fromWeek[0], String.valueOf(fromWeek[1]));
      Assert.isTrue(
        ((String) fromWeek[1]).startsWith('Started Week 2 from Week 1.'),
        String.valueOf(fromWeek[1])
      );
    }
  }
}
