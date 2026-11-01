/**
 * A special day's or event's own schedule and "Set it up" through an agent or the command line
 * (docs/protocol/api.md API-1.76 to API-1.79), on synthetic camps (SpecialScheduleTestData's
 * Color War, SetTimeTestData): read as its page shows it, a cell and the frame changed by the
 * screen's own saves only while they hold what the AI read, and Set it up kept first as a version
 * so undo brings the week's cells back. Records are made inside the scheduler's runAs.
 */
@IsTest
private class AgentSpecialScheduleTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);

  /** One request to a door; answers [status, sentence]. */
  private static List<Object> ask(
    AgentWeeks.Action door,
    String method,
    Map<String, Object> body
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = method;
    if (method == 'GET') {
      for (String key : body.keySet()) {
        RestContext.request.addParameter(key, String.valueOf(body.get(key)));
      }
    } else {
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    }
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

  private static Map<String, Object> colorWar(
    String season,
    Map<String, Object> more
  ) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => season,
      'special' => 'color war'
    };
    body.putAll(more);
    return body;
  }

  private static String seasonName(Id seasonId) {
    return [SELECT Name FROM Season__c WHERE Id = :seasonId WITH SYSTEM_MODE]
    .Name;
  }

  // API-1.76, API-1.77
  @IsTest
  static void aCellIsTheScreensSaveOnlyWhileItHoldsWhatWasRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      SpecialScheduleTestData.colorWar(ids);
      String season = seasonName(ids.get('Season'));
      Map<String, Object> cell = new Map<String, Object>{
        'column' => 'Blue',
        'time' => 'Relays',
        'was' => 'Open',
        'activity' => 'swim'
      };
      Test.startTest();
      List<Object> read = ask(
        new AgentReadSpecialSchedule(),
        'GET',
        colorWar(season, new Map<String, Object>())
      );
      List<Object> placed = ask(
        new AgentSpecialCell(),
        'POST',
        colorWar(season, cell)
      );
      // The AI still thinks it is Open.
      List<Object> stale = ask(
        new AgentSpecialCell(),
        'POST',
        colorWar(season, cell)
      );
      List<Object> after = ask(
        new AgentReadSpecialSchedule(),
        'GET',
        colorWar(season, new Map<String, Object>())
      );
      Test.stopTest();
      String said = String.valueOf(read[1]);
      Assert.areEqual(200, read[0], said);
      Assert.isTrue(said.contains('Columns: Blue, Gold.'), said);
      Assert.isTrue(
        said.contains('Relays (09:50-11:20): Blue Open; Gold Open'),
        said
      );
      Assert.isTrue(said.contains('seen: 4 '), said);
      Assert.areEqual(200, placed[0], String.valueOf(placed[1]));
      Assert.areEqual(
        'Placed swim · Blue · Relays. To undo it, change the cell back (was: Open).',
        placed[1]
      );
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(
        'Changed by someone else: Blue · Relays holds Swim now. Nothing was changed.',
        stale[1]
      );
      Assert.isTrue(
        String.valueOf(after[1]).contains('Blue Swim; Gold Open'),
        String.valueOf(after[1])
      );
    }
  }

  // API-1.78
  @IsTest
  static void theFrameIsTheScreensChangeAtTheRevisionSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id eventId = SpecialScheduleTestData.colorWar(ids);
      String season = seasonName(ids.get('Season'));
      Test.startTest();
      List<Object> stale = ask(
        new AgentSpecialFrame(),
        'POST',
        colorWar(
          season,
          new Map<String, Object>{
            'action' => 'add_station',
            'name' => 'Green',
            'seen' => '3'
          }
        )
      );
      List<Object> added = ask(
        new AgentSpecialFrame(),
        'POST',
        colorWar(
          season,
          new Map<String, Object>{
            'action' => 'add_time_block',
            'start_time' => '1:00 PM',
            'end_time' => '2pm',
            'seen' => '4'
          }
        )
      );
      List<Object> moved = ask(
        new AgentSpecialFrame(),
        'POST',
        colorWar(
          season,
          new Map<String, Object>{
            'action' => 'move_station',
            'target' => 'Gold',
            'direction' => 'left',
            'seen' => '5'
          }
        )
      );
      List<Object> noSeen = ask(
        new AgentSpecialFrame(),
        'POST',
        colorWar(season, new Map<String, Object>{ 'action' => 'clear' })
      );
      Test.stopTest();
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(200, added[0], String.valueOf(added[1]));
      Assert.isTrue(
        String.valueOf(added[1]).endsWith('seen is now 5.'),
        String.valueOf(added[1])
      );
      Assert.areEqual(200, moved[0], String.valueOf(moved[1]));
      Assert.areEqual(400, noSeen[0], String.valueOf(noSeen[1]));
      ScheduleGrid grid = SpecialPlans.read(eventId).grid;
      Assert.areEqual(3, grid.blocks.size());
      Assert.areEqual('13:00', grid.blocks[2].startTime);
      Assert.areEqual('Gold', grid.groups[0].name);
    }
  }

  // API-1.79
  @IsTest
  static void setItUpIsTheScreensKeptFirstAndUndone() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id draftId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
        if (read.day == MONDAY) {
          read.grid.items.add(new ScheduleGrid.Item('S', '', 'Carnival'));
          read.grid.rows[0][0] = String.valueOf(read.grid.items.size());
          ScheduleDaySaves.write(
            draftId,
            new List<ScheduleDaySaves.DaySave>{
              new ScheduleDaySaves.DaySave(read.day, read.grid, read.revision)
            }
          );
        }
      }
      Map<String, Object> body = new Map<String, Object>{
        'season' => seasonName(ids.get('Season')),
        'week' => 'Week 1',
        'program' => 'Main',
        'kind' => 'Special event',
        'name' => 'carnival'
      };
      Test.startTest();
      List<Object> setUp = ask(new AgentSetUpNoted(), 'POST', body);
      // Set up already: nothing noted with that name now.
      List<Object> again = ask(new AgentSetUpNoted(), 'POST', body);
      List<Object> undone = ask(
        new AgentUndo(),
        'POST',
        new Map<String, Object>{
          'season' => body.get('season'),
          'week' => 'Week 1',
          'program' => 'Main'
        }
      );
      Test.stopTest();
      Assert.areEqual(200, setUp[0], String.valueOf(setUp[1]));
      Assert.isTrue(
        String.valueOf(setUp[1])
          .startsWith('"carnival" is set up as a special event.'),
        String.valueOf(setUp[1])
      );
      Assert.areEqual(409, again[0], String.valueOf(again[1]));
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      ScheduleGrid monday;
      for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
        if (read.day == MONDAY) {
          monday = read.grid;
        }
      }
      ScheduleGrid.Item item = monday.items[
        Integer.valueOf(monday.rows[0][0]) - 1
      ];
      Assert.isTrue(String.isBlank(item.id), 'The cell is noted again');
    }
  }
}
