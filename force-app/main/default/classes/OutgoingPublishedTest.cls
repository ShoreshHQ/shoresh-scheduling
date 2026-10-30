/**
 * What goes out is what the published week shows (docs/protocol/api.md API-6.2): a rain switch
 * as published, and a week two programs publish, day by day. Camp Willow (synthetic).
 */
@IsTest
private class OutgoingPublishedTest {
  // The draft being edited, and Group A's Monday Period 2 in it (aRainSwitch...).
  private static Id draft;
  private static SlotEdits.Run at;

  /** Week 1's first day, with Group A at Swim (two blocks) and Group B at Flagpole then Chugim. */
  private static Date firstDay(IncomingTestData camp) {
    Week__c week = [
      SELECT StartDate__c
      FROM Week__c
      WHERE Id = :camp.ids.get('Week 1')
      WITH SYSTEM_MODE
    ];
    return week.StartDate__c;
  }

  private static ScheduleGrid grid(IncomingTestData camp) {
    return ShoreshTestData.grid(
      [
        SELECT Id, Name
        FROM TimeBlock__c
        WHERE Program__c = :camp.ids.get('Main')
        WITH SYSTEM_MODE
        ORDER BY SortOrder__c
      ],
      [
        SELECT Id, Name
        FROM Group__c
        WHERE Division__c = :camp.ids.get('Juniors')
        WITH SYSTEM_MODE
        ORDER BY Name
      ],
      // Made-up records for the items: what goes out is the names Publish kept.
      new Map<String, Id>{
        'Swim' => camp.ids.get('Main'),
        'Flagpole' => camp.ids.get('Juniors')
      }
    );
  }

  /** The web address's answer: status, then the body (JSON parsed, CSV as text). */
  private static Map<String, Object> get(
    OutgoingDoors.Capability capability,
    Map<String, String> params
  ) {
    RestRequest request = new RestRequest();
    request.requestURI = '/services/apexrest/v1/' + capability.name();
    request.httpMethod = 'GET';
    request.params.putAll(params);
    RestContext.request = request;
    RestContext.response = new RestResponse();
    OutgoingDoors.byWeb(capability);
    String body = RestContext.response.responseBody.toString();
    Map<String, Object> answer = body.startsWith('{')
      ? (Map<String, Object>) JSON.deserializeUntyped(body)
      : new Map<String, Object>{ 'csv' => body };
    answer.put('status', RestContext.response.statusCode);
    return answer;
  }

  private static Map<String, String> week1() {
    return new Map<String, String>{
      'season' => 'Summer 2026',
      'week' => 'Week 1'
    };
  }

  // API-6.2: what goes out is what the published week shows. A rain switch changes the draft's
  // cells to the rain plan (repo ADR 0019), and Publish copies those cells, so a switched day goes
  // out with the rain plan, never the activity it replaced. Made the way the screen does it:
  // place Soccer, switch it to its rain plan (Gym games) with the raindrop, publish.
  @IsTest
  static void aRainSwitchGoesOutAsThePublishedWeekShowsIt() {
    Date monday = Date.newInstance(2026, 6, 29);
    Map<String, Id> ids;
    System.runAs(ShoreshTestData.scheduler()) {
      SetTimeGuard.defer();
      try {
        ids = SetTimeTestData.camp();
        SetTimeGuard.checkPending();
      } finally {
        SetTimeGuard.resume();
      }
      SlotRunsTestData.useBlocks(
        new List<Id>{
          ids.get('Period 1'),
          ids.get('Period 2'),
          ids.get('Lunch')
        }
      );
      Id draftId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      draft = draftId;
      at = SlotRunsTestData.at(monday, ids.get('Group A'), ids.get('Period 2'));
      place('', 'A:' + ids.get('Soccer'), null);
      SlotEdits.RainDay rain = new SlotEdits.RainDay();
      rain.day = monday;
      rain.cells = new List<String>{
        ids.get('Group A') +
        '|' +
        ids.get('Period 2') +
        '|' +
        ids.get('Gym games') +
        '|' +
        RainMarks.SWITCHED
      };
      place('A:' + ids.get('Soccer'), 'A:' + ids.get('Gym games'), rain);
      SchedulePublish.Preview preview = ManualBuildController.previewPublish(
        draftId
      );
      SchedulePublish.Result published = ManualBuildController.publish(
        draftId,
        preview.revisions,
        null
      );
      Assert.isFalse(published.draftChanged || published.publishedChanged);
    }
    User key = ShoreshTestData.userWith('Read_Group_Schedules');
    shareSeason(ids.get('Season'), key.Id);
    Map<String, Object> answer;
    System.runAs(key) {
      answer = get(new OutgoingGroupSchedule(), week1());
    }
    List<String> mondayGroupA = new List<String>();
    for (Object each : (List<Object>) answer.get('records')) {
      Map<String, Object> row = (Map<String, Object>) each;
      if (
        row.get('date') == String.valueOf(monday) &&
        row.get('group') == 'Group A'
      ) {
        mondayGroupA.add(row.get('time_block') + ': ' + row.get('activity'));
      }
    }
    Assert.areEqual(
      new List<String>{ 'Period 2: Gym games' },
      mondayGroupA,
      String.valueOf(answer)
    );
  }

  /** Group A's Monday Period 2 changes from was to now, with this day's raindrops (or none). */
  private static void place(String was, String now, SlotEdits.RainDay rain) {
    at.before = null;
    at.after = null;
    at.blockIds = null;
    SlotEdits.Edit edit = SlotRunsTestData.edit(
      at,
      new List<String>{ was },
      new List<String>{ now }
    );
    if (rain != null) {
      edit.rain = new List<SlotEdits.RainDay>{ rain };
    }
    SlotEdits.Result result = ManualBuildController.saveSlots(
      draft,
      new List<SlotEdits.Edit>{ edit }
    );
    Assert.isTrue(result.conflicts.isEmpty(), String.valueOf(result));
  }

  private static void shareSeason(Id seasonId, Id userId) {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Database.insert(
        new Season__Share(
          ParentId = seasonId,
          UserOrGroupId = userId,
          AccessLevel = 'Read'
        ),
        AccessLevel.SYSTEM_MODE
      );
    }
  }

  // API-6.2: a week two programs publish goes out day by day: each day has every program's
  // groups (in program order) before the next day starts.
  @IsTest
  static void aWeekOfTwoProgramsGoesOutDayByDay() {
    IncomingTestData camp = new IncomingTestData();
    Program__c teens = ShoreshTestData.program(camp.season.Id, 'Teens');
    Database.update(
      new Program__c(Id = teens.Id, SortOrder__c = 0),
      AccessLevel.SYSTEM_MODE
    );
    Date first = firstDay(camp);
    ScheduleGrid mainDay = grid(camp);
    ScheduleGrid teensDay = new ScheduleGrid();
    teensDay.blocks.add(
      new ScheduleGrid.Block(camp.ids.get('Period 1'), 'Period 1')
        .at('09:00', '09:45')
    );
    teensDay.groups.add(new ScheduleGrid.GroupRef(teens.Id, 'Teen A'));
    teensDay.items.add(
      new ScheduleGrid.Item('A', camp.ids.get('Main'), 'Hike')
    );
    teensDay.rows.add(new List<String>{ '1' });
    // Teens sorts first (0) though its name sorts after Main's and it was made later: only the
    // programs' order can put it first.
    days(teens.Id, camp, teensDay);
    days(camp.ids.get('Main'), camp, mainDay);
    Map<String, Object> answer;
    System.runAs(camp.sender('Read_Group_Schedules')) {
      answer = get(new OutgoingGroupSchedule(), week1());
    }
    List<String> order = new List<String>();
    for (Object each : (List<Object>) answer.get('records')) {
      Map<String, Object> row = (Map<String, Object>) each;
      order.add(
        (row.get('date') == String.valueOf(first) ? 'day 1 ' : 'day 2 ') +
          row.get('group') +
          ' ' +
          row.get('activity')
      );
    }
    Assert.areEqual(
      new List<String>{
        'day 1 Teen A Hike',
        'day 1 Group A Swim',
        'day 1 Group B Flagpole',
        'day 1 Group B Chugim',
        'day 2 Teen A Hike',
        'day 2 Group A Swim',
        'day 2 Group B Flagpole',
        'day 2 Group B Chugim'
      },
      order,
      String.valueOf(answer)
    );
  }

  /** A program's published schedule of Week 1 with this grid on its first two days. */
  private static void days(
    Id programId,
    IncomingTestData camp,
    ScheduleGrid day
  ) {
    List<Date> dates = new List<Date>{
      firstDay(camp),
      firstDay(camp).addDays(1)
    };
    Schedule__c schedule = new Schedule__c(
      Program__c = programId,
      Week__c = camp.ids.get('Week 1'),
      Name = 'Published',
      Status__c = 'Published',
      Origin__c = 'Manual'
    );
    PublishedGuard.allow();
    Database.insert(schedule, AccessLevel.SYSTEM_MODE);
    List<ScheduleDay__c> made = new List<ScheduleDay__c>();
    for (Date each : dates) {
      made.add(
        new ScheduleDay__c(
          Schedule__c = schedule.Id,
          Date__c = each,
          Part__c = 1,
          Revision__c = 1,
          GridFormatVersion__c = ScheduleGrid.FORMAT_VERSION,
          Grid__c = day.toText()
        )
      );
    }
    Database.insert(made, AccessLevel.SYSTEM_MODE);
    PublishedGuard.done();
  }
}
