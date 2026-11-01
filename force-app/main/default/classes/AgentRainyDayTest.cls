/**
 * A rainy day through an agent or the command line (docs/protocol/api.md API-1.65):
 * /v1/switch_to_rain_plans takes the runs and marks the week editor's own rainy day works out (the
 * connector runs it) and saves them as the screen's own save, with the week kept first as "Before
 * rainy Monday" marked Through an agent, so undo_last_agent_change switches the day back; refused
 * with nothing changed when the day's cells or marks changed since the agent read them. Synthetic
 * camp (SetTimeTestData), Manual Build: Soccer (outdoors, Gym games its rain plan) in Group A's
 * and Group B's Monday Period 2.
 */
@IsTest
private class AgentRainyDayTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  private static final String CHANGE = 'Rainy Monday';
  private static Map<String, Id> ids;

  private static Id soccerMorning() {
    ids = SetTimeTestData.camp();
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
    Id draftId = ManualBuildController.startBlankWeek(
        ids.get('Main'),
        ids.get('Week 1')
      )
      .schedule.schedule.id;
    List<SlotEdits.Edit> edits = new List<SlotEdits.Edit>();
    for (String grp : new List<String>{ 'Group A', 'Group B' }) {
      edits.add(
        SlotRunsTestData.edit(
          SlotRunsTestData.at(MONDAY, ids.get(grp), ids.get('Period 2')),
          new List<String>{ '' },
          new List<String>{ a('Soccer') }
        )
      );
    }
    Assert.isTrue(
      ManualBuildController.saveSlots(draftId, edits).conflicts.isEmpty(),
      'The morning was a conflict'
    );
    return draftId;
  }

  private static String a(String activity) {
    return 'A:' + ids.get(activity);
  }

  private static String mark(String grp, String activity) {
    return String.valueOf(ids.get(grp)) +
      '|' +
      String.valueOf(ids.get('Period 2')) +
      '|' +
      String.valueOf(ids.get(activity));
  }

  /**
   * The switch as the connector sends it: Group A's Soccer (as it saw it) to Gym games, marked
   * switched, Group B's marked full, with the day's marks as read (seen).
   */
  private static Map<String, Object> rainy(String saw, List<Object> seen) {
    return new Map<String, Object>{
      'season' => [
        SELECT Name
        FROM Season__c
        WHERE Id = :ids.get('Season')
        WITH SYSTEM_MODE
      ]
      .Name,
      'week' => 'Week 1',
      'program' => 'Main',
      'schedule' => 'Manual Build',
      'change' => CHANGE,
      'said' => '1 switched to rain plans, 1 full',
      'runs' => new List<Object>{
        new Map<String, Object>{
          'day' => String.valueOf(MONDAY),
          'groupId' => ids.get('Group A'),
          'firstBlockId' => ids.get('Period 2'),
          'blockIds' => new List<Object>{ ids.get('Period 2') },
          'before' => new List<Object>{ saw },
          'after' => new List<Object>{ a('Gym games') }
        }
      },
      'rain' => new List<Object>{
        new Map<String, Object>{
          'day' => String.valueOf(MONDAY),
          'cells' => new List<Object>{
            mark('Group A', 'Gym games') +
            '|' +
            RainMarks.SWITCHED,
            mark('Group B', 'Soccer')
          }
        }
      },
      'seen' => seen
    };
  }

  private static List<Object> send(
    AgentWeeks.Action door,
    Map<String, Object> body
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentWeeks.answer(door);
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  /** Group A's Monday Period 2, and Monday's marks, as saved. */
  private static List<Object> monday(Id draftId) {
    ScheduleDays.DayGrid day = ScheduleDays.read(draftId)[0];
    Assert.areEqual(MONDAY, day.day);
    Integer g = SlotIds.indexOf(day.grid.groupIds(), ids.get('Group A'));
    return new List<Object>{
      SlotIds.ofRow(day.grid, g)[1],
      new Set<String>(day.rain)
    };
  }

  private static List<Schedule__c> agentVersions(Id draftId) {
    return [
      SELECT Name
      FROM Schedule__c
      WHERE
        SourceSchedule__c = :draftId
        AND VersionReason__c = :AgentWeeks.THROUGH_AGENT
      WITH SYSTEM_MODE
    ];
  }

  // API-1.65
  @IsTest
  static void theSwitchIsTheScreensSaveKeptFirstAsBeforeRainy() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id draftId = soccerMorning();
      Test.startTest();
      List<Object> done = send(
        new AgentRainyDay(),
        rainy(a('Soccer'), new List<Object>())
      );
      Test.stopTest();
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual(
        'Rainy Monday: 1 switched to rain plans, 1 full. undo_last_agent_change switches it back.',
        done[1]
      );
      List<Object> now = monday(draftId);
      Assert.areEqual(a('Gym games'), now[0]);
      Assert.areEqual(
        new Set<String>(
          RainMarks.normal(
            new List<String>{
              mark('Group A', 'Gym games') +
              '|' +
              RainMarks.SWITCHED,
              mark('Group B', 'Soccer')
            }
          )
        ),
        now[1]
      );
      List<Schedule__c> kept = agentVersions(draftId);
      Assert.areEqual(1, kept.size(), 'one version kept, through an agent');
      Assert.areEqual('Before rainy Monday', kept[0].Name);
    }
  }

  // API-1.65
  @IsTest
  static void aDayChangedSinceIsRefusedWithNothingChanged() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id draftId = soccerMorning();
      Test.startTest();
      List<Object> cells = send(
        new AgentRainyDay(),
        rainy(a('Swim'), new List<Object>())
      );
      List<Object> marks = send(
        new AgentRainyDay(),
        rainy(a('Soccer'), new List<Object>{ mark('Group B', 'Soccer') })
      );
      List<Object> unreadable = send(
        new AgentRainyDay(),
        rainy(a('Soccer'), null)
      );
      Test.stopTest();
      Assert.areEqual(409, cells[0], String.valueOf(cells[1]));
      Assert.areEqual(409, marks[0], String.valueOf(marks[1]));
      Assert.areEqual(400, unreadable[0], String.valueOf(unreadable[1]));
      List<Object> now = monday(draftId);
      Assert.areEqual(a('Soccer'), now[0], 'nothing changed');
      Assert.isTrue(((Set<String>) now[1]).isEmpty(), 'no marks left');
      Assert.isTrue(agentVersions(draftId).isEmpty(), 'nothing kept');
    }
  }

  // API-1.65
  @IsTest
  static void undoSwitchesTheDayBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id draftId = soccerMorning();
      Map<String, Object> asked = rainy(a('Soccer'), new List<Object>());
      Test.startTest();
      List<Object> done = send(new AgentRainyDay(), asked);
      List<Object> undone = send(
        new AgentUndo(),
        new Map<String, Object>{
          'season' => asked.get('season'),
          'week' => 'Week 1',
          'program' => 'Main',
          'schedule' => 'Manual Build'
        }
      );
      Test.stopTest();
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      List<Object> now = monday(draftId);
      Assert.areEqual(a('Soccer'), now[0], 'back to the dry day');
      Assert.isTrue(((Set<String>) now[1]).isEmpty(), 'its marks gone too');
    }
  }
}
