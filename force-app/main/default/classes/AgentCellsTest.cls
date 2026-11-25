/**
 * Edits of several cells through an agent or the command line (docs/protocol/api.md API-1.38 to
 * API-1.40, API-1.148): /v1/move_cell, /v1/take_out_cell and /v1/copy_cells take the runs the
 * week editor's own module works out (the connector runs it) and makes them the screen's hand
 * edit, keeping no version, as the screen keeps none; undo_last_change takes it back with
 * the runs back the connector holds, on GeneratedTestData's camp (Gym games in every Period 2;
 * Group A's Monday Lunch Open).
 */
@IsTest
private class AgentCellsTest {
  // What the last answer left for the connector to hold for Undo.
  private static Map<String, Object> undo;
  private static final String MOVED = 'Moved Gym games to Group A · Monday · Lunch';

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

  /** Group A's Gym games moved from Monday's Period 2 to Lunch, as the screen's run says it, by an agent that saw what. */
  private static Map<String, Object> move(String saw) {
    Map<String, Id> ids = GeneratedTestData.ids;
    return week(
      new Map<String, Object>{
        'change' => MOVED,
        'said' => '',
        'runs' => new List<Object>{
          new Map<String, Object>{
            'day' => '2026-06-29',
            'groupId' => ids.get('Group A'),
            'firstBlockId' => ids.get('Period 2'),
            'blockIds' => new List<Object>{
              ids.get('Period 2'),
              ids.get('Lunch')
            },
            'before' => new List<Object>{ saw, '' },
            'after' => new List<Object>{ '', GeneratedTestData.a('Gym games') },
            'locksBefore' => new List<Object>{ '', '' }
          }
        }
      }
    );
  }

  /** Sends body to the web address; answers [status, sentence]. */
  private static List<Object> send(String address, Map<String, Object> body) {
    // The week as read now, unless the test says what the connector read (revision).
    if (address != 'undo_last_change' && !body.containsKey('revision')) {
      body.put('revision', GeneratedTestData.weekNow());
    }
    RestContext.request = new RestRequest();
    RestContext.request.requestURI = '/services/apexrest/v1/' + address;
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    if (address == 'move_cell') {
      AgentMoveCell.post();
    } else if (address == 'take_out_cell') {
      AgentTakeOutCell.post();
    } else if (address == 'copy_cells') {
      AgentCopyCells.post();
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

  private static List<String> mondayA(Id draftId) {
    return GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0));
  }

  // API-1.38, API-1.40, API-1.148
  @IsTest
  static void severalCellsAreTheScreensHandEditKeepNoVersionAndAreUndone() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      String gym = GeneratedTestData.a('Gym games');
      Map<String, Object> sent = move(gym);
      Integer before = Limits.getQueries();
      List<Object> answer = send('move_cell', sent);
      Integer used = Limits.getQueries() - before;
      List<String> afterMove = mondayA(draftId);
      // The screen's hand edit locks what it fills (LOCK-1.1): so does this.
      Boolean lockedLunch = ScheduleGridLocks.isLocked(
        ScheduleDays.read(draftId)[0].grid,
        GeneratedTestData.GROUP_A,
        GeneratedTestData.LUNCH
      );
      Integer kept = GeneratedTestData.versions();
      List<Object> undone = send(
        'undo_last_change',
        week(
          new Map<String, Object>{
            'held' => AgentUndoTestCalls.held(
              AgentUndoTestCalls.editHeld(undo, (List<Object>) sent.get('runs'))
            )
          }
        )
      );
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual(MOVED + '.', answer[1]);
      Assert.areEqual('', afterMove[GeneratedTestData.PERIOD_2]);
      Assert.areEqual(gym, afterMove[GeneratedTestData.LUNCH]);
      Assert.isTrue(lockedLunch, 'The moved cell is locked');
      Assert.areEqual(0, kept);
      Assert.isTrue(used < 32, 'A move used ' + used + ' queries');
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual('Undone: ' + MOVED + '.', undone[1]);
      Assert.areEqual(gym, mondayA(draftId)[GeneratedTestData.PERIOD_2]);
      Assert.areEqual('', mondayA(draftId)[GeneratedTestData.LUNCH]);
      Assert.areEqual(0, GeneratedTestData.versions());
    }
  }

  // API-1.39
  @IsTest
  static void cellsChangedSinceAreAConflictAndNothingChanges() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      List<Object> answer = send(
        'take_out_cell',
        move(GeneratedTestData.a('Soccer'))
      );
      Test.stopTest();
      Assert.areEqual(409, answer[0]);
      Assert.areEqual(
        'Changed by someone else since you read the week: ' +
          MOVED +
          '. Nothing was changed.',
        answer[1]
      );
      Assert.areEqual(
        GeneratedTestData.a('Gym games'),
        mondayA(draftId)[GeneratedTestData.PERIOD_2]
      );
      Assert.areEqual(0, GeneratedTestData.versions());
    }
  }

  // API-1.39
  @IsTest
  static void anUnreadableChangeIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      GeneratedTestData.generated();
      Test.startTest();
      List<Object> answer = send(
        'copy_cells',
        week(new Map<String, Object>{ 'change' => 'Moved', 'runs' => 'x' })
      );
      Test.stopTest();
      Assert.areEqual(400, answer[0]);
      Assert.areEqual(
        'That change could not be read. Download Shoresh\'s connector again from Settings in Shoresh.',
        answer[1]
      );
      Assert.areEqual(0, GeneratedTestData.versions());
    }
  }
}
