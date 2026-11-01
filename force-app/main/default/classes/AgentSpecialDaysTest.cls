/**
 * Special days and events through an agent or the command line (docs/protocol/api.md API-1.73 to
 * API-1.75): read as the Special events screen lists them, put on and taken off a day by the
 * screen's own actions only while the day has what the AI read, and a special event over cells as
 * the week editor places it, marked Through an agent and undone. On synthetic camps
 * (SpecialScheduleTestData, GeneratedTestData), records made inside the scheduler's runAs.
 */
@IsTest
private class AgentSpecialDaysTest {
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

  private static String seasonName(Id seasonId) {
    return [SELECT Name FROM Season__c WHERE Id = :seasonId WITH SYSTEM_MODE]
    .Name;
  }

  /** Tuesday of Week 1, as an agent that saw seen asks. */
  private static Map<String, Object> tuesday(
    String season,
    String specialDay,
    String seen
  ) {
    return new Map<String, Object>{
      'season' => season,
      'special_day' => specialDay,
      'week' => 'Week 1',
      'day' => 'tuesday',
      'seen' => seen
    };
  }

  /** The special days on Week 1's Tuesday now, by name. */
  private static List<String> onTuesday(Id weekId) {
    List<String> names = new List<String>();
    for (SpecialDate__c row : [
      SELECT SpecialDay__r.Name
      FROM SpecialDate__c
      WHERE Week__c = :weekId AND Day__c = 'Tuesday'
      WITH SYSTEM_MODE
    ]) {
      names.add(row.SpecialDay__r.Name);
    }
    return names;
  }

  // API-1.73
  @IsTest
  static void specialDaysAndEventsAreReadAsTheScreenListsThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      SpecialScheduleTestData.addDay(ids.get('Season'), 'Visiting Day');
      SpecialScheduleTestData.addEvent(ids.get('Season'), 'Color War');
      SpecialDates.place(ids.get('Field Day'), ids.get('Week 1'), 'Tuesday');
      String season = seasonName(ids.get('Season'));
      Test.startTest();
      List<Object> read = ask(
        new AgentReadSpecialDays(),
        'GET',
        new Map<String, Object>{ 'season' => season }
      );
      List<Object> unknown = ask(
        new AgentReadSpecialDays(),
        'GET',
        new Map<String, Object>{ 'season' => season, 'week' => 'Week 1' }
      );
      List<Object> noSeen = ask(
        new AgentSpecialDay(),
        'POST',
        tuesday(season, 'Field Day', '')
      );
      Test.stopTest();
      String said = String.valueOf(read[1]);
      Assert.areEqual(200, read[0], said);
      Assert.isTrue(
        said.contains(
          '"Field Day": on Tuesday of "Week 1"; "Visiting Day": not on a day.'
        ),
        said
      );
      Assert.isTrue(
        said.contains('with place_special_event): "Color War".'),
        said
      );
      Assert.isTrue(said.endsWith('its seen is "none".'), said);
      Assert.areEqual(400, unknown[0], String.valueOf(unknown[1]));
      Assert.areEqual(400, noSeen[0], String.valueOf(noSeen[1]));
    }
  }

  // API-1.74
  @IsTest
  static void specialDaysArePutOnAndTakenOffOnlyAsTheDayWasSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      SpecialScheduleTestData.addDay(ids.get('Season'), 'Visiting Day');
      String season = seasonName(ids.get('Season'));
      Id week = ids.get('Week 1');
      Test.startTest();
      Integer queries = Limits.getQueries();
      List<Object> put = ask(
        new AgentSpecialDay(),
        'POST',
        tuesday(season, 'field day', 'none')
      );
      Integer used = Limits.getQueries() - queries;
      // Someone put Field Day there since the AI read "none".
      List<Object> stale = ask(
        new AgentSpecialDay(),
        'POST',
        tuesday(season, 'Visiting Day', 'none')
      );
      List<Object> asked = ask(
        new AgentSpecialDay(),
        'POST',
        tuesday(season, 'Visiting Day', 'Field Day')
      );
      List<String> afterAsking = onTuesday(week);
      Map<String, Object> yes = tuesday(season, 'Visiting Day', 'Field Day');
      yes.put('replace', true);
      List<Object> replaced = ask(new AgentSpecialDay(), 'POST', yes);
      // Capitals count: the day has "Visiting Day".
      List<Object> wrongCase = ask(
        new AgentSpecialDay(AgentSpecialDay.TAKE_OFF),
        'POST',
        tuesday(season, 'Visiting Day', 'visiting day')
      );
      List<Object> takenOff = ask(
        new AgentSpecialDay(AgentSpecialDay.TAKE_OFF),
        'POST',
        tuesday(season, 'Visiting Day', 'Visiting Day')
      );
      // Not on that day: said, nothing changed, nothing to undo.
      List<Object> notThere = ask(
        new AgentSpecialDay(AgentSpecialDay.TAKE_OFF),
        'POST',
        tuesday(season, 'Field Day', 'none')
      );
      Test.stopTest();

      Assert.areEqual(200, put[0], String.valueOf(put[1]));
      Assert.areEqual(
        '"Field Day" is on Tuesday of "Week 1". take_special_day_off_day takes it off again; the day\'s own schedule was kept.',
        put[1]
      );
      Assert.isTrue(used < 30, 'A put used ' + used + ' queries');
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(
        'Someone else changed Tuesday of "Week 1" since you read it: it has "Field Day" now. Nothing was changed. Read it again with read_special_days.',
        stale[1]
      );
      Assert.areEqual(200, asked[0], String.valueOf(asked[1]));
      Assert.isTrue(
        String.valueOf(asked[1])
          .startsWith(
            'Tuesday of "Week 1" already has the special day "Field Day". Use this one instead?'
          ),
        String.valueOf(asked[1])
      );
      Assert.isTrue(
        String.valueOf(asked[1]).endsWith('send it again with replace: true.'),
        String.valueOf(asked[1])
      );
      Assert.areEqual(new List<String>{ 'Field Day' }, afterAsking);
      Assert.areEqual(200, replaced[0], String.valueOf(replaced[1]));
      Assert.areEqual(
        '"Visiting Day" is on Tuesday of "Week 1". "Field Day" stays saved: put_special_day_on_day with it puts it back on that day.',
        replaced[1]
      );
      Assert.areEqual(409, wrongCase[0], String.valueOf(wrongCase[1]));
      Assert.areEqual(200, takenOff[0], String.valueOf(takenOff[1]));
      Assert.areEqual(
        'Tuesday of "Week 1" has its regular schedule again. "Visiting Day" stays saved. put_special_day_on_day puts it back.',
        takenOff[1]
      );
      Assert.areEqual(
        '"Field Day" is not on Tuesday of "Week 1".',
        notThere[1]
      );
      Assert.areEqual(new List<String>(), onTuesday(week));
    }
  }

  // API-1.75
  @IsTest
  static void anEventOverCellsIsTheScreensHandEditMarkedAndUndone() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Id event = SpecialScheduleTestData.addEvent(
        GeneratedTestData.ids.get('Season'),
        'Color War'
      );
      String change = 'Placed Color War · Group A · Monday · Lunch';
      Map<String, Object> body = new Map<String, Object>{
        'season' => seasonName(GeneratedTestData.ids.get('Season')),
        'week' => 'Week 1',
        'program' => 'Main',
        'change' => change,
        'said' => '',
        'runs' => new List<Object>{
          new Map<String, Object>{
            'day' => '2026-06-29',
            'groupId' => GeneratedTestData.ids.get('Group A'),
            'firstBlockId' => GeneratedTestData.ids.get('Lunch'),
            'blockIds' => new List<Object>{
              GeneratedTestData.ids.get('Lunch')
            },
            'before' => new List<Object>{ '' },
            'after' => new List<Object>{ 'S:' + event },
            'locksBefore' => new List<Object>{ '' }
          }
        }
      };
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
      RestContext.response = new RestResponse();
      AgentPlaceSpecialEvent.post();
      Integer status = RestContext.response.statusCode;
      String said = RestContext.response.responseBody.toString();
      List<String> placed = GeneratedTestData.slots(
        draftId,
        GeneratedTestData.at(0, 0)
      );
      Integer marked = [
        SELECT COUNT()
        FROM Schedule__c
        WHERE VersionReason__c = :AgentWeeks.THROUGH_AGENT
        WITH SYSTEM_MODE
      ];
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
      Assert.areEqual(200, status, said);
      Assert.isTrue(said.contains(change + '.'), said);
      Assert.areEqual('S:' + event, placed[GeneratedTestData.LUNCH]);
      Assert.areEqual(1, marked);
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual(
        '',
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.LUNCH
        ]
      );
    }
  }
}
