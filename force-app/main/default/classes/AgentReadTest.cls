/**
 * Reading Shoresh from an AI chat in plain words (docs/protocol/api.md API-1.24 to API-1.26): the
 * season the screens open on, names that exist when one asked for doesn't, the seasons listed, and
 * the week as the Schedules screen shows it. Camp Willow's Summer 2026 (synthetic).
 */
@IsTest
private class AgentReadTest {
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

  /** A schedule of Week 1 with this one day, Published or a draft, written as Publish would. */
  private static Schedule__c schedule(
    IncomingTestData camp,
    String status,
    ScheduleGrid day
  ) {
    Schedule__c schedule = new Schedule__c(
      Program__c = camp.ids.get('Main'),
      Week__c = camp.ids.get('Week 1'),
      Name = status,
      Status__c = status,
      Origin__c = 'Manual'
    );
    PublishedGuard.allow();
    Database.insert(schedule, AccessLevel.SYSTEM_MODE);
    Database.insert(
      new ScheduleDay__c(
        Schedule__c = schedule.Id,
        Date__c = firstDay(camp),
        Part__c = 1,
        Revision__c = 1,
        GridFormatVersion__c = ScheduleGrid.FORMAT_VERSION,
        Grid__c = day.toText()
      ),
      AccessLevel.SYSTEM_MODE
    );
    PublishedGuard.done();
    return schedule;
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

  // API-1.24: with no season named, a read is of the season Shoresh's screens open on (the first
  // camp by name, its season starting latest); when that isn't one season it names the seasons
  // instead of guessing.
  @IsTest
  static void noSeasonNamedReadsTheSeasonTheScreensOpenOn() {
    IncomingTestData camp = new IncomingTestData();
    schedule(camp, 'Published', grid(camp));
    Season__c older = ShoreshTestData.season(
      camp.season.Camp__c,
      'Summer 2025'
    );
    older.StartDate__c = Date.newInstance(2025, 6, 30);
    Database.update(older, AccessLevel.SYSTEM_MODE);
    Map<String, Object> answer = get(
      new OutgoingGroupSchedule(),
      new Map<String, String>{ 'week' => 'Week 1' }
    );
    Assert.areEqual(200, answer.get('status'), String.valueOf(answer));
    Assert.areEqual('Summer 2026', answer.get('season'));
    Assert.areEqual('Summer 2026', AgentSeasons.answer().get('opens_on'));

    // Camp Aspen comes first by name, as on the screens: its one season.
    Id aspen = ShoreshTestData.camp('Camp Aspen').Id;
    ShoreshTestData.season(aspen, 'Aspen 2026');
    Assert.areEqual('Aspen 2026', AgentSeasons.answer().get('opens_on'));
    // Two of its seasons starting the same day: not one season, so it asks.
    ShoreshTestData.season(aspen, 'Aspen day camp 2026');
    answer = get(
      new OutgoingGroupSchedule(),
      new Map<String, String>{ 'week' => 'Week 1' }
    );
    Assert.areEqual(400, answer.get('status'));
    Assert.areEqual(
      'Say which season (season). Seasons this user can see: Aspen 2026 (Camp Aspen), Aspen day camp 2026 (Camp Aspen), Summer 2026 (Camp Willow), Summer 2025 (Camp Willow).',
      answer.get('message')
    );
    Assert.isNull(AgentSeasons.answer().get('opens_on'));
  }

  // API-1.25: a season or week name that isn't there comes back with the names that are.
  @IsTest
  static void anUnknownNameComesBackWithTheNamesThatExist() {
    IncomingTestData camp = new IncomingTestData();
    schedule(camp, 'Published', grid(camp));
    Map<String, Object> noWeek = get(
      new OutgoingGroupSchedule(),
      new Map<String, String>{ 'season' => 'Summer 2026', 'week' => 'Week 9' }
    );
    Assert.areEqual(
      'There is no week called "Week 9" in Summer 2026. Its weeks: Week 1, Week 2, Week 3, Week 4, Week 5, Week 6.',
      noWeek.get('message')
    );
    Map<String, Object> noSeason = get(
      new OutgoingGroupSchedule(),
      new Map<String, String>{ 'season' => 'Summer 2027', 'week' => 'Week 1' }
    );
    Assert.areEqual(
      'There is no season called "Summer 2027" that this user can see. Seasons this user can see: Summer 2026.',
      noSeason.get('message')
    );
    // A week not published in the season asked for names the seasons where it is.
    Season__c older = ShoreshTestData.season(
      camp.season.Camp__c,
      'Summer 2025'
    );
    ShoreshTestData.weeks(older.Id, 1);
    Map<String, Object> notThere = get(
      new OutgoingGroupSchedule(),
      new Map<String, String>{ 'season' => 'Summer 2025', 'week' => 'Week 1' }
    );
    Assert.areEqual(
      'Nothing in Week 1 of Summer 2025 is published yet. Week 1 is published in: Summer 2026. Schedules go out once a week is published.',
      notThere.get('message')
    );
  }

  // API-1.24: the seasons the person can see, each with its weeks and programs.
  @IsTest
  static void listSeasonsGivesEachSeasonWithItsWeeks() {
    IncomingTestData camp = new IncomingTestData();
    Map<String, Object> answer;
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      answer = AgentSeasons.answer();
    }
    Map<String, Object> season = (Map<String, Object>) ((List<Object>) answer.get(
      'seasons'
    ))[0];
    Assert.areEqual('Summer 2026', season.get('season'));
    Assert.areEqual('Camp Willow', season.get('camp'));
    Assert.areEqual(6, ((List<Object>) season.get('weeks')).size());
    Assert.areEqual('Week 1', ((List<Object>) season.get('weeks'))[0]);
    Assert.areEqual(new List<Object>{ 'Main' }, season.get('programs'));
    Assert.areEqual('Summer 2026', answer.get('opens_on'));
  }

  // API-1.26: the week's view is exactly what the Schedules screen opens for its published week.
  @IsTest
  static void theWeekViewIsTheSchedulesScreensOwn() {
    IncomingTestData camp = new IncomingTestData();
    Schedule__c published = schedule(camp, 'Published', grid(camp));
    schedule(camp, 'Draft', grid(camp));
    Map<String, Object> answer;
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      answer = AgentWeekView.answer(null, 'week 1');
      List<Object> programs = (List<Object>) answer.get('programs');
      Assert.areEqual(1, programs.size());
      Map<String, Object> program = (Map<String, Object>) programs[0];
      Assert.areEqual('Main', program.get('program'));
      Assert.areEqual(
        JSON.serialize(SchedulesController.openSchedule(published.Id)),
        JSON.serialize(program.get('view'))
      );
    }
    Assert.areEqual('Week 1', answer.get('week'));
    Assert.areEqual('Summer 2026', answer.get('season'));
  }
}
