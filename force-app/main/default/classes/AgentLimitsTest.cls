/**
 * The AI's heaviest requests through their web addresses, on GeneratedLimitsTest's big camp (8
 * groups x 8 time blocks x 5 days, two other programs with a published week), built once by a
 * scheduler: week_view, read_week_draft, week_checks and schedule_cell stay under half of
 * Salesforce's limits for one request (queries, CPU time, heap held); week_view's queries don't
 * grow with its published programs. Synthetic camp.
 */
@IsTest
private class AgentLimitsTest {
  // Half of Salesforce's limits for one request (queries under 50 of 100, CPU under 5 of 10 s,
  // heap under 3 of 6 MB), so a bigger camp than this one still fits: the AI's requests below.
  // Apex gives only the heap held at a moment, not the most a request reached, so the heap check
  // catches what a request keeps (its answer and what it holds on to), not a passing spike.
  // read_week_draft and week_checks read the week's setup once for the week and its setup
  // changes: measured 47 on this camp (2026-11-25, 60 before), so their bound is this 50 itself
  // (measured + 5 would pass it).
  private static final Integer HALF_QUERIES = 50;
  private static final Integer HALF_CPU_MS = 5000;
  private static final Integer HALF_HEAP = 3 * 1024 * 1024;

  @TestSetup
  static void makeCamp() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids;
    System.runAs(scheduler) {
      ids = GeneratedLimitsTest.bigCamp();
    }
    ids.put('Scheduler', scheduler.Id);
    KeptCamp.keepIds(ids);
  }

  /** Setup's camp, kept where GeneratedTestData's helpers read it; call before System.runAs. */
  private static Map<String, Id> sharedCamp() {
    Map<String, Id> ids = KeptCamp.keptIds();
    GeneratedTestData.ids = ids;
    return ids;
  }

  /** One AI request (a read: GET with params; a change: POST with body); answers [status, text]. */
  private static List<Object> asked(Object door, Map<String, Object> sent) {
    RestContext.request = new RestRequest();
    RestContext.response = new RestResponse();
    if (door instanceof AgentRequest.Read) {
      RestContext.request.httpMethod = 'GET';
      for (String key : sent.keySet()) {
        RestContext.request.addParameter(key, String.valueOf(sent.get(key)));
      }
    } else {
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(sent));
    }
    AgentAskFirstTestCalls.answer(door);
    return new List<Object>{
      RestContext.response.statusCode,
      RestContext.response.responseBody.toString()
    };
  }

  /** Week 1 of Main on this camp, with more fields. */
  private static Map<String, Object> mainWeek(Map<String, Object> more) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => 'Summer 2026',
      'week' => 'Week 1',
      'program' => 'Main'
    };
    body.putAll(more);
    return body;
  }

  /**
   * What one request used, measured from Test.startTest(): queries, CPU and heap under half of
   * their limits. Measured on 2026-11-25: CPU 73 ms for week_view, under 500 ms for the draft read.
   */
  private static void assertWithinLimits(String what) {
    Integer queries = Limits.getQueries();
    Integer cpu = Limits.getCpuTime();
    Integer heap = Limits.getHeapSize();
    Assert.isTrue(
      queries < HALF_QUERIES,
      what + ' used ' + queries + ' queries (fewer than ' + HALF_QUERIES + ')'
    );
    Assert.isTrue(
      cpu < HALF_CPU_MS,
      what + ' used ' + cpu + ' ms of CPU (under ' + HALF_CPU_MS + ')'
    );
    Assert.isTrue(
      heap < HALF_HEAP,
      what + ' used ' + heap + ' bytes of heap (under ' + HALF_HEAP + ')'
    );
  }

  // G8: week_view opens what the Schedules screen opens for each published program of the week.
  @IsTest
  static void aPublishedWeekViewIsUnderHalfTheLimits() {
    System.runAs(KeptCamp.scheduler(sharedCamp())) {
      // Camp words read cold, as a request of its own reads them.
      CampLabels.forget();
      Test.startTest();
      List<Object> view = asked(
        new AgentWeekView(),
        new Map<String, Object>{ 'season' => 'Summer 2026', 'week' => 'Week 1' }
      );
      assertWithinLimits('week_view of two published programs');
      Test.stopTest();
      Assert.areEqual(200, view[0], (String) view[1]);
      Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
        (String) view[1]
      );
      Assert.areEqual(2, ((List<Object>) answer.get('programs')).size());
    }
  }

  // G8: week_view opens every published program's week together (SchedulesController
  // .openSchedules), so its queries don't grow with the programs: measured the same for one
  // program and for ten (2026-11-25; 6 more a program before), each program's view still exactly
  // what the Schedules screen opens for it.
  @IsTest
  static void aWeekViewsQueriesDontGrowWithItsPublishedPrograms() {
    System.runAs(KeptCamp.scheduler(KeptCamp.keptIds())) {
      SetTimeGuard.defer();
      Map<String, Id> one;
      Map<String, Id> ten;
      try {
        one = GeneratedLimitsTest.seasonWith(new List<String>{ 'Teens' });
        List<String> programs = new List<String>();
        for (Integer i = 1; i <= 10; i++) {
          programs.add('Program ' + i);
        }
        ten = GeneratedLimitsTest.seasonWith(programs);
        SetTimeGuard.checkPending();
      } finally {
        SetTimeGuard.resume();
      }
      carryFieldDay(one);
      carryFieldDay(ten);
      // Both seasons are called Summer 2026, as the big camp's is: named apart for the reads.
      Database.update(
        new List<Season__c>{
          new Season__c(Id = one.get('Season'), Name = 'One 2026'),
          new Season__c(Id = ten.get('Season'), Name = 'Ten 2026')
        },
        AccessLevel.SYSTEM_MODE
      );
      List<Schedule__c> published = publishedIn(ten.get('Week 1'), 10);
      Test.startTest();
      Map<String, Object> viewOne = AgentWeekView.answer('One 2026', 'Week 1');
      Integer withOne = Limits.getQueries();
      Map<String, Object> viewTen = AgentWeekView.answer('Ten 2026', 'Week 1');
      Integer withTen = Limits.getQueries() - withOne;
      Integer cpu = Limits.getCpuTime();
      // The two with Field Day and one without, each as the Schedules screen opens it alone.
      List<String> screens = new List<String>();
      for (Integer i = 0; i < 3; i++) {
        screens.add(
          JSON.serialize(SchedulesController.openSchedule(published[i].Id))
        );
      }
      Test.stopTest();
      Assert.areEqual(1, ((List<Object>) viewOne.get('programs')).size());
      List<Object> tenViews = (List<Object>) viewTen.get('programs');
      Assert.areEqual(10, tenViews.size());
      Assert.isTrue(
        withTen <= withOne,
        'Ten published programs used ' +
          withTen +
          ' queries, one used ' +
          withOne
      );
      Assert.isTrue(withTen < HALF_QUERIES, withTen + ' queries');
      Assert.isTrue(cpu < HALF_CPU_MS, 'Both views used ' + cpu + ' ms of CPU');
      for (Integer i = 0; i < screens.size(); i++) {
        Assert.areEqual(
          screens[i],
          JSON.serialize(((Map<String, Object>) tenViews[i]).get('view')),
          'Program ' + (i + 1) + ' as the Schedules screen opens it'
        );
      }
      // The first two carried a special day each, on a day of their own: each shows only its own.
      Assert.isTrue(screens[0].contains('Field Day'), screens[0]);
      Assert.isTrue(screens[1].contains('Field Day'), screens[1]);
      Assert.isFalse(screens[2].contains('Field Day'), screens[2]);
    }
  }

  /** The week's first published schedules, in week_view's order (its programs'). */
  private static List<Schedule__c> publishedIn(Id weekId, Integer most) {
    return [
      SELECT Id
      FROM Schedule__c
      WHERE Week__c = :weekId AND Status__c = :SchedulePublish.PUBLISHED
      WITH USER_MODE
      ORDER BY Program__r.SortOrder__c, Program__r.Name, Id
      LIMIT :most
    ];
  }

  /**
   * The season's first two published programs (in week_view's order; its only one, when it has
   * one) carry Field Day, as Publish keeps it (SpecialsCarried): on their first and their second
   * day, with that day's plan.
   */
  private static void carryFieldDay(Map<String, Id> ids) {
    SpecialDay__c fieldDay = new SpecialDay__c(
      Season__c = ids.get('Season'),
      Name = 'Field Day',
      SortOrder__c = 1
    );
    Database.insert(fieldDay, AccessLevel.SYSTEM_MODE);
    List<Schedule__c> published = publishedIn(ids.get('Week 1'), 2);
    PublishedGuard.allow();
    Map<Id, List<ScheduleDays.DayGrid>> daysById = ScheduleDays.read(
      new Map<Id, Schedule__c>(published).keySet()
    );
    try {
      for (Integer i = 0; i < published.size(); i++) {
        ScheduleDays.DayGrid day = daysById.get(published[i].Id)[i];
        ScheduleSpecials.Special special = new ScheduleSpecials.Special();
        special.kind = ScheduleSpecials.DAY;
        special.itemId = fieldDay.Id;
        special.name = 'Field Day';
        special.dateValue = day.day;
        special.grid = day.grid;
        SpecialsCarried.write(
          published[i].Id,
          new List<ScheduleSpecials.Special>{ special }
        );
      }
    } finally {
      PublishedGuard.done();
    }
  }

  @IsTest
  static void anAiReadOfTheDraftStaysWithinItsMeasuredLimits() {
    System.runAs(KeptCamp.scheduler(sharedCamp())) {
      GeneratedTestData.generated();
      // Camp words read cold, as a request of its own reads them.
      CampLabels.forget();
      Test.startTest();
      List<Object> draft = asked(
        new AgentChecks('draft'),
        mainWeek(new Map<String, Object>())
      );
      assertWithinLimits('read_week_draft');
      Test.stopTest();
      Assert.areEqual(200, draft[0], (String) draft[1]);
    }
  }

  @IsTest
  static void anAiReadOfTheChecksStaysWithinItsMeasuredLimits() {
    System.runAs(KeptCamp.scheduler(sharedCamp())) {
      GeneratedTestData.generated();
      // Camp words read cold, as a request of its own reads them.
      CampLabels.forget();
      Test.startTest();
      List<Object> checks = asked(
        new AgentChecks('checks'),
        mainWeek(new Map<String, Object>())
      );
      assertWithinLimits('week_checks');
      Test.stopTest();
      Assert.areEqual(200, checks[0], (String) checks[1]);
    }
  }

  // G8: one cell typed in by an AI (Group A's Monday Period 2, Gym games to Swim).
  @IsTest
  static void anAiCellChangeIsUnderHalfTheLimits() {
    Map<String, Id> ids = sharedCamp();
    System.runAs(KeptCamp.scheduler(ids)) {
      GeneratedTestData.generated();
      Map<String, Object> change = mainWeek(
        new Map<String, Object>{
          'change' => 'Placed Swim · Group A · Monday · Period 2',
          'said' => '',
          'revision' => GeneratedTestData.weekNow(),
          'runs' => new List<Object>{
            new Map<String, Object>{
              'day' => '2026-06-29',
              'groupId' => ids.get('Group A'),
              'firstBlockId' => ids.get('Period 2'),
              'blockIds' => new List<Object>{ ids.get('Period 2') },
              'before' => new List<Object>{ GeneratedTestData.a('Gym games') },
              'after' => new List<Object>{ GeneratedTestData.a('Swim') },
              'locksBefore' => new List<Object>{ '' }
            }
          }
        }
      );
      // Camp words read cold, as a request of its own reads them.
      CampLabels.forget();
      Test.startTest();
      List<Object> answer = asked(new AgentCells(), change);
      assertWithinLimits('schedule_cell');
      Test.stopTest();
      Assert.areEqual(200, answer[0], (String) answer[1]);
    }
  }
}
