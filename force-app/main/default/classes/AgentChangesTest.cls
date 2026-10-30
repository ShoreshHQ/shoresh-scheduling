/**
 * The person's own changes through an agent or the command line (docs/protocol/api.md API-1.11
 * to API-1.14): /v1/cell and /v1/undo on GeneratedTestData's camp, whose first Generate puts Gym
 * games in every group's Period 2.
 */
@IsTest
private class AgentChangesTest {
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

  /** A change of Group A's Monday Period 2 to activity, by an agent that saw was there. */
  private static Map<String, Object> cell(String was, String activity) {
    return week(
      new Map<String, Object>{
        'group' => 'Group A',
        'day' => 'Monday',
        'time' => 'Period 2',
        'was' => was,
        'activity' => activity
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
    if (address == 'cell') {
      AgentCell.post();
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

  private static List<Schedule__c> agentVersions() {
    return [
      SELECT Name, RevisionsAfter__c
      FROM Schedule__c
      WHERE VersionReason__c = :AgentWeeks.THROUGH_AGENT
      WITH SYSTEM_MODE
    ];
  }

  // API-1.11, API-1.12
  @IsTest
  static void aCellChangeIsTheScreensHandEditAndIsMarked() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      Id draftId = GeneratedTestData.generated();
      Integer before = Limits.getQueries();
      List<Object> answer = send('cell', cell('Gym games', 'Soccer'));
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
      List<Schedule__c> marked = agentVersions();
      Assert.areEqual(1, marked.size());
      Assert.areEqual('Before Placed Soccer · ' + WHERE_A, marked[0].Name);
      Assert.isNotNull(marked[0].RevisionsAfter__c);
      Assert.isTrue(used < 60, 'A cell change used ' + used + ' queries');
    }
  }

  // API-1.13
  @IsTest
  static void aCellSomeoneElseChangedIsAConflictWithTheScreensWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      Id draftId = GeneratedTestData.generated();
      List<Object> answer = send('cell', cell('Archery', 'Soccer'));
      Test.stopTest();
      Assert.areEqual(409, answer[0]);
      Assert.areEqual(
        'Changed by someone else: ' +
          WHERE_A +
          ' holds Gym games now. Nothing was changed.',
        answer[1]
      );
      Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
      Assert.isTrue(agentVersions().isEmpty());
    }
  }

  // API-1.13
  @IsTest
  static void aLockedCellIsRefusedAsOnScreen() {
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
      List<Object> answer = send('cell', cell('Gym games', 'Soccer'));
      Test.stopTest();
      Assert.areEqual(400, answer[0]);
      Assert.areEqual(WHERE_A + ' is locked.', answer[1]);
      Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
      Assert.isTrue(agentVersions().isEmpty());
    }
  }

  // API-1.14
  @IsTest
  static void undoTakesBackTheLastChangeOnce() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      send('cell', cell('Gym games', 'Soccer'));
      List<Object> undone = send('undo', week(new Map<String, Object>()));
      List<Object> again = send('undo', week(new Map<String, Object>()));
      Test.stopTest();
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual('Undid "Placed Soccer · ' + WHERE_A + '".', undone[1]);
      Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
      Assert.areEqual(400, again[0]);
      Assert.areEqual(
        'There is no change made through an agent to undo in Week 1.',
        again[1]
      );
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
      send('cell', cell('Gym games', 'Soccer'));
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
      List<Object> undone = send('undo', week(new Map<String, Object>()));
      Test.stopTest();
      Assert.areEqual(400, undone[0]);
      Assert.isTrue(
        String.valueOf(undone[1])
          .startsWith('Someone saved Week 1 since "Placed Soccer'),
        String.valueOf(undone[1])
      );
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
      List<Object> answer = send('cell', asked);
      Test.stopTest();
      Assert.areEqual(400, answer[0]);
      Assert.areEqual(AgentWeeks.NO_ACCESS, answer[1]);
    }
    Assert.areEqual(GeneratedTestData.a('Gym games'), periodTwo(draftId));
  }
}
