/**
 * The AI's heaviest requests through their web addresses, on GeneratedLimitsTest's big camp (8
 * groups x 8 time blocks x 5 days, two other programs with a published week), built once by a
 * scheduler: week_view, read_week_draft, week_checks and schedule_cell stay under half of
 * Salesforce's limits for one request (queries, CPU time, heap held); week_view adds a few queries
 * per published program. Synthetic camp.
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
  // G8: week_view opens each published program's week as the Schedules screen opens one (its
  // schedule, days and special days), so a camp's programs add up: measured 11 for one program and
  // 23 for three (2026-11-25), 6 a program, so 8 published programs would pass the 50 the bar asks.
  // Bounded near that per program (one to spare) until one read opens them all.
  private static final Integer MOST_QUERIES_PER_PROGRAM_VIEW = 7;

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

  @IsTest
  static void aWeekViewAddsAFewQueriesPerPublishedProgram() {
    System.runAs(KeptCamp.scheduler(KeptCamp.keptIds())) {
      SetTimeGuard.defer();
      Map<String, Id> one;
      Map<String, Id> three;
      try {
        one = GeneratedLimitsTest.seasonWith(new List<String>{ 'Teens' });
        three = GeneratedLimitsTest.seasonWith(
          new List<String>{ 'Teens', 'Kids', 'Tweens' }
        );
        SetTimeGuard.checkPending();
      } finally {
        SetTimeGuard.resume();
      }
      // Both seasons are called Summer 2026, as the big camp's is: named apart for the reads.
      Database.update(
        new List<Season__c>{
          new Season__c(Id = one.get('Season'), Name = 'One 2026'),
          new Season__c(Id = three.get('Season'), Name = 'Three 2026')
        },
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      Map<String, Object> viewOne = AgentWeekView.answer('One 2026', 'Week 1');
      Integer withOne = Limits.getQueries();
      Map<String, Object> viewThree = AgentWeekView.answer(
        'Three 2026',
        'Week 1'
      );
      Integer withThree = Limits.getQueries() - withOne;
      Test.stopTest();
      Assert.areEqual(1, ((List<Object>) viewOne.get('programs')).size());
      Assert.areEqual(3, ((List<Object>) viewThree.get('programs')).size());
      Assert.isTrue(
        withThree - withOne <= 2 * MOST_QUERIES_PER_PROGRAM_VIEW,
        'Two more programs added ' +
          (withThree - withOne) +
          ' queries to week_view (at most ' +
          MOST_QUERIES_PER_PROGRAM_VIEW +
          ' each)'
      );
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
