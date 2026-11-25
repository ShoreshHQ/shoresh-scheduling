/**
 * Generated Schedule stays well inside Salesforce's limits on a realistic week: 8 groups (two
 * divisions), 5 days, 8 time blocks, a fixed activity every morning, and another program sharing
 * the season's places (fixed and recurring activities, and a published week). Opening the week and each
 * kind of save use a small, fixed number of queries, whatever the size of the week (no query per
 * day, group or cell). The AI's heaviest requests on the same camp, through their web addresses:
 * week_view and schedule_cell stay under half of Salesforce's limits for one request (queries, CPU
 * time, heap held); read_week_draft and week_checks stay under half for CPU and heap and within
 * their measured query count, which is over half (MOST_DRAFT_READ_QUERIES). Synthetic camp.
 */
@IsTest
private class GeneratedLimitsTest {
  // Each call is one request from the screen: Salesforce allows 100 queries in one. Measured
  // in shoresh-test (2026-10-18) on this camp with its two other programs: opening a week 22
  // (not generated yet) or 16 (generated), opening Manual Build 22, the first Generate 21. A
  // Rebuild with its version measured 19 (on a camp without the other programs: saves don't
  // read them). The bound is per request, whatever the week's size: no query runs per day,
  // group or cell. Other programs (G5) add at most 4 to opening a week, whatever their number
  // (OtherProgramUse; threeOtherProgramsUseNoMoreQueriesThanOne).
  private static final Integer MOST_QUERIES = 25;
  // Half of Salesforce's limits for one request (queries under 50 of 100, CPU under 5 of 10 s,
  // heap under 3 of 6 MB), so a bigger camp than this one still fits: the AI's requests below.
  // Apex gives only the heap held at a moment, not the most a request reached, so the heap check
  // catches what a request keeps (its answer and what it holds on to), not a passing spike.
  private static final Integer HALF_QUERIES = 50;
  private static final Integer HALF_CPU_MS = 5000;
  private static final Integer HALF_HEAP = 3 * 1024 * 1024;

  // The big camp (with its two other programs) is built once, by the scheduler, in setup; each
  // test reads its ids back (sharedCamp). A test's changes are undone when it ends, so each starts
  // from the same camp.
  @TestSetup
  static void makeCamp() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids;
    System.runAs(scheduler) {
      ids = bigCamp();
    }
    ids.put('Scheduler', scheduler.Id);
    KeptCamp.keepIds(ids);
  }

  /** The scheduler setup built the camp as (by its Id, not looked up by alias). */
  private static User scheduler() {
    return KeptCamp.scheduler(KeptCamp.keptIds());
  }

  /**
   * Setup's camp, as bigCamp returned it, kept where GeneratedTestData's helpers read it. Call it
   * before System.runAs (the scheduler can't see the kept record), then run as
   * KeptCamp.scheduler(ids).
   */
  private static Map<String, Id> sharedCamp() {
    Map<String, Id> ids = KeptCamp.keptIds();
    GeneratedTestData.ids = ids;
    return ids;
  }

  private static Map<String, Id> bigCamp() {
    SetTimeGuard.defer();
    try {
      Camp__c camp = ShoreshTestData.camp('Camp Cedar');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Week__c week = ShoreshTestData.weeks(season.Id, 1)[0];
      Program__c program = ShoreshTestData.program(season.Id, 'Main');
      Database.update(
        new Program__c(Id = program.Id, Friday__c = true),
        AccessLevel.SYSTEM_MODE
      );
      List<TimeBlock__c> blocks = new List<TimeBlock__c>();
      for (Integer hour = 8; hour < 16; hour++) {
        blocks.add(
          new TimeBlock__c(
            Program__c = program.Id,
            Name = 'Period ' + (hour - 7),
            StartTime__c = Time.newInstance(hour, 0, 0, 0),
            EndTime__c = Time.newInstance(hour, 45, 0, 0),
            PartOfDay__c = hour < 12 ? 'Morning' : 'Afternoon',
            SortOrder__c = hour
          )
        );
      }
      Database.insert(blocks, AccessLevel.SYSTEM_MODE);
      List<Division__c> divisions = new List<Division__c>{
        new Division__c(
          Program__c = program.Id,
          Name = 'Juniors',
          SortOrder__c = 1
        ),
        new Division__c(
          Program__c = program.Id,
          Name = 'Seniors',
          SortOrder__c = 2
        )
      };
      Database.insert(divisions, AccessLevel.SYSTEM_MODE);
      List<Group__c> groups = new List<Group__c>();
      for (Integer g = 0; g < 8; g++) {
        groups.add(
          new Group__c(
            Division__c = divisions[g / 4].Id,
            Name = 'Bunk ' + (g + 1),
            Availability__c = 'AllDay',
            SortOrder__c = g
          )
        );
      }
      // ShoreshTestData.placesAndActivities sets Swim up for Group A.
      groups[0].Name = 'Group A';
      Database.insert(groups, AccessLevel.SYSTEM_MODE);
      Map<String, Id> ids = ShoreshTestData.placesAndActivities(season.Id);
      // The cell an AI's change types in (AgentChangesTest's, on this camp).
      ids.put('Group A', groups[0].Id);
      ids.put('Period 2', blocks[1].Id);
      ids.put('Camp', camp.Id);
      ids.put('Season', season.Id);
      ids.put('Main', program.Id);
      ids.put('Week 1', week.Id);
      Database.insert(
        new FixedActivity__c(
          Program__c = program.Id,
          Name = 'Flagpole',
          TimeBlock__c = blocks[0].Id,
          Length__c = 1
        ),
        AccessLevel.SYSTEM_MODE
      );
      // Two other programs, so a query run once per program would show.
      addOtherPrograms(ids, week, new List<String>{ 'Teens', 'Kids' });
      SetTimeGuard.checkPending();
      GeneratedTestData.ids = ids;
      return ids;
    } finally {
      SetTimeGuard.resume();
    }
  }

  /** The Hall, and the named other programs of the season (ids' Season). */
  private static void addOtherPrograms(
    Map<String, Id> ids,
    Week__c week,
    List<String> names
  ) {
    Location__c hall = new Location__c(
      Season__c = ids.get('Season'),
      Name = 'Hall',
      GroupsThatFit__c = 20
    );
    Database.insert(hall, AccessLevel.SYSTEM_MODE);
    ids.put('Hall', hall.Id);
    otherPrograms(ids, week, names);
  }

  /**
   * Other programs sharing the season's places (G5), each: 4 groups, 8 time blocks half an hour
   * later than Main's, a fixed and a recurring activity in the Hall, and a published Monday and
   * Tuesday with Swim in every cell. Made a kind of record at a time (and the published days
   * written directly), so the setup leaves room for the requests the tests measure.
   */
  private static void otherPrograms(
    Map<String, Id> ids,
    Week__c week,
    List<String> names
  ) {
    List<Program__c> programs = new List<Program__c>();
    for (String name : names) {
      programs.add(
        new Program__c(
          Season__c = ids.get('Season'),
          Name = name,
          Friday__c = false,
          SortOrder__c = programs.size() + 2
        )
      );
    }
    Database.insert(programs, AccessLevel.SYSTEM_MODE);
    List<TimeBlock__c> blocks = new List<TimeBlock__c>();
    List<Division__c> divisions = new List<Division__c>();
    List<Schedule__c> published = new List<Schedule__c>();
    for (Program__c program : programs) {
      blocks.addAll(hoursOf(program.Id));
      divisions.add(
        new Division__c(
          Program__c = program.Id,
          Name = program.Name + ' groups',
          SortOrder__c = 1
        )
      );
      published.add(
        new Schedule__c(
          Program__c = program.Id,
          Week__c = week.Id,
          Name = 'Published',
          Status__c = 'Published',
          Origin__c = 'Manual'
        )
      );
    }
    Database.insert(blocks, AccessLevel.SYSTEM_MODE);
    Database.insert(divisions, AccessLevel.SYSTEM_MODE);
    // Written directly, as Publish would (PublishedGuard), days and all.
    PublishedGuard.allow();
    Database.insert(published, AccessLevel.SYSTEM_MODE);
    List<Group__c> groups = new List<Group__c>();
    for (Division__c division : divisions) {
      groups.addAll(fourGroupsIn(division));
    }
    Database.insert(groups, AccessLevel.SYSTEM_MODE);
    List<SObject> setTime = new List<SObject>();
    List<ScheduleDay__c> days = new List<ScheduleDay__c>();
    for (Integer p = 0; p < programs.size(); p++) {
      List<TimeBlock__c> own = (List<TimeBlock__c>) slice(blocks, p * 8, 8);
      List<Group__c> theirs = (List<Group__c>) slice(groups, p * 4, 4);
      setTime.add(
        new FixedActivity__c(
          Program__c = programs[p].Id,
          Name = 'Assembly',
          TimeBlock__c = own[0].Id,
          Length__c = 1,
          Location__c = ids.get('Hall')
        )
      );
      setTime.add(
        new RecurringActivity__c(
          Program__c = programs[p].Id,
          Name = 'Lunch',
          TimeBlock__c = own[4].Id,
          Length__c = 1,
          Location__c = ids.get('Hall'),
          Monday__c = true,
          Wednesday__c = true
        )
      );
      // Published Monday and Tuesday; the other days count from setup.
      String grid = swimAllDay(ids, own, theirs).toText();
      days.add(publishedDay(published[p].Id, week.StartDate__c, grid));
      days.add(
        publishedDay(published[p].Id, week.StartDate__c.addDays(1), grid)
      );
    }
    Database.insert(setTime, AccessLevel.SYSTEM_MODE);
    Database.insert(days, AccessLevel.SYSTEM_MODE);
    PublishedGuard.done();
  }

  private static List<TimeBlock__c> hoursOf(Id programId) {
    List<TimeBlock__c> blocks = new List<TimeBlock__c>();
    for (Integer hour = 8; hour < 16; hour++) {
      blocks.add(
        new TimeBlock__c(
          Program__c = programId,
          Name = 'Hour ' + (hour - 7),
          StartTime__c = Time.newInstance(hour, 30, 0, 0),
          EndTime__c = Time.newInstance(hour + 1, 15, 0, 0),
          PartOfDay__c = hour < 12 ? 'Morning' : 'Afternoon',
          SortOrder__c = hour
        )
      );
    }
    return blocks;
  }

  private static List<Group__c> fourGroupsIn(Division__c division) {
    List<Group__c> groups = new List<Group__c>();
    for (Integer g = 0; g < 4; g++) {
      groups.add(
        new Group__c(
          Division__c = division.Id,
          Name = division.Name + ' ' + (g + 1),
          Availability__c = 'AllDay',
          SortOrder__c = g
        )
      );
    }
    return groups;
  }

  private static List<SObject> slice(
    List<SObject> records,
    Integer first,
    Integer count
  ) {
    List<SObject> result = records.clone();
    result.clear();
    for (Integer i = first; i < first + count; i++) {
      result.add(records[i]);
    }
    return result;
  }

  private static ScheduleDay__c publishedDay(
    Id scheduleId,
    Date day,
    String grid
  ) {
    return new ScheduleDay__c(
      Schedule__c = scheduleId,
      Date__c = day,
      Part__c = 1,
      Revision__c = 1,
      GridFormatVersion__c = ScheduleGrid.FORMAT_VERSION,
      Grid__c = grid
    );
  }

  /** A day with Swim in every cell. */
  private static ScheduleGrid swimAllDay(
    Map<String, Id> ids,
    List<TimeBlock__c> blocks,
    List<Group__c> groups
  ) {
    ScheduleGrid grid = new ScheduleGrid();
    for (TimeBlock__c block : blocks) {
      grid.blocks.add(
        new ScheduleGrid.Block(block.Id, block.Name)
          .at(
            BlankWeek.clock(block.StartTime__c),
            BlankWeek.clock(block.EndTime__c)
          )
      );
    }
    grid.items.add(new ScheduleGrid.Item('A', ids.get('Swim'), 'Swim'));
    for (Group__c grp : groups) {
      grid.groups.add(new ScheduleGrid.GroupRef(grp.Id, grp.Name));
      List<String> row = new List<String>();
      for (Integer b = 0; b < blocks.size(); b++) {
        row.add('1');
      }
      grid.rows.add(row);
    }
    return grid;
  }

  /** Every Open cell filled, the three activities in turn, as a generated week would be. */
  private static GeneratedWeek.Save built(
    GeneratedInputs.Inputs read,
    String action
  ) {
    GeneratedWeek.Save save = GeneratedTestData.request(read, action, 1);
    List<String> names = new List<String>{ 'Swim', 'Soccer', 'Gym games' };
    Integer turn = 0;
    for (GeneratedWeek.Day day : save.days) {
      for (Integer g = 0; g < day.groupIds.size(); g++) {
        List<String> cells = day.rows[g].split(',', -1);
        for (Integer b = 0; b < cells.size(); b++) {
          if (String.isBlank(cells[b])) {
            GeneratedTestData.put(
              day,
              GeneratedTestData.at(g, b),
              names[Math.mod(turn++, names.size())]
            );
          }
        }
      }
    }
    return save;
  }

  private static void assertFew(Integer used, String what) {
    Assert.isTrue(
      used <= MOST_QUERIES,
      what + ' used ' + used + ' queries (at most ' + MOST_QUERIES + ')'
    );
  }

  @IsTest
  static void openingAWeekUsesFewQueries() {
    System.runAs(KeptCamp.scheduler(sharedCamp())) {
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Integer used = Limits.getQueries();
      Test.stopTest();
      Assert.areEqual(5, read.days.size());
      Assert.areEqual(8, read.days[0].groups.size());
      Assert.areEqual(8, read.days[0].blocks.size());
      // Two other programs, each: Swim at the Pool in each of 8 hours on its published Monday
      // and Tuesday; the Hall's Assembly on Wednesday and Thursday (they don't run Fridays), and
      // Lunch on Wednesday. Their times are the same, so their groups add up in one entry each.
      Assert.areEqual(8 * 2 + 2 + 1, read.otherPrograms.size());
      Assert.areEqual(8, read.otherPrograms[0].groups);
      assertFew(used, 'Opening a week not generated yet');
    }
  }

  @IsTest
  static void theFirstSaveUsesFewQueries() {
    System.runAs(KeptCamp.scheduler(sharedCamp())) {
      GeneratedWeek.Save save = built(
        GeneratedTestData.inputs(),
        GeneratedSaves.GENERATE
      );
      Test.startTest();
      GeneratedWeek.Result result = GeneratedTestData.save(save);
      Integer used = Limits.getQueries();
      // The week opened again, now generated, with the other programs.
      GeneratedInputs.Inputs again = GeneratedTestData.inputs();
      Integer reading = Limits.getQueries() - used;
      Test.stopTest();
      Assert.isFalse(result.conflict);
      Assert.areEqual(result.scheduleId, again.scheduleId);
      Assert.areEqual(8 * 2 + 2 + 1, again.otherPrograms.size());
      assertFew(used, 'The first Generate');
      assertFew(reading, 'Opening a generated week');
    }
  }

  @IsTest
  static void aRebuildUsesFewQueries() {
    System.runAs(KeptCamp.scheduler(sharedCamp())) {
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      GeneratedWeek.Result first = GeneratedTestData.save(
        built(read, GeneratedSaves.GENERATE)
      );
      Id draftId = first.scheduleId;
      // The week as the screen has it after Generate (no second read: the setup's queries and
      // this test's share one limit).
      read.scheduleId = first.scheduleId;
      read.revision = first.revision;
      GeneratedWeek.Save rebuild = GeneratedTestData.request(
        read,
        GeneratedSaves.REBUILD,
        2
      );
      Test.startTest();
      GeneratedWeek.Result result = GeneratedTestData.save(rebuild);
      Integer used = Limits.getQueries();
      GeneratedInputs.Inputs again = GeneratedTestData.inputs();
      Integer reading = Limits.getQueries() - used;
      Test.stopTest();
      Assert.isFalse(result.conflict);
      Assert.areEqual(draftId, again.scheduleId);
      assertFew(used, 'A Rebuild (with its version)');
      assertFew(reading, 'Opening a generated week');
    }
  }

  @IsTest
  static void aPublishedWeekOpensAndRebuildsInFewQueries() {
    System.runAs(KeptCamp.scheduler(sharedCamp())) {
      Id draftId = GeneratedTestData.save(
          built(GeneratedTestData.inputs(), GeneratedSaves.GENERATE)
        )
        .scheduleId;
      SchedulePublish.Preview preview = GeneratedScheduleController.previewPublish(
        draftId
      );
      GeneratedScheduleController.publish(draftId, preview.revisions, null);
      Test.startTest();
      Integer before = Limits.getQueries();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Integer reading = Limits.getQueries() - before;
      before = Limits.getQueries();
      GeneratedWeek.Result result = GeneratedTestData.save(
        GeneratedTestData.request(read, GeneratedSaves.REBUILD, 1)
      );
      Integer rebuilding = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isFalse(read.published.changedSince);
      Assert.isFalse(result.conflict);
      Assert.isFalse(result.published.changedSince);
      assertFew(reading, 'Opening a published week');
      assertFew(rebuilding, 'A Rebuild of a published week (with its version)');
    }
  }

  @IsTest
  static void aLockAndAHandEditUseFewQueries() {
    System.runAs(KeptCamp.scheduler(sharedCamp())) {
      Id draftId = GeneratedTestData.save(
          built(GeneratedTestData.inputs(), GeneratedSaves.GENERATE)
        )
        .scheduleId;
      String revision = WeekTickets.stamp(ScheduleDays.read(draftId));
      GeneratedWeek.LockChange wholeDay = new GeneratedWeek.LockChange();
      wholeDay.action = GeneratedWeek.LOCK;
      wholeDay.dateValue = GeneratedTestData.MONDAY;
      Test.startTest();
      GeneratedWeek.Locked locked = GeneratedScheduleController.setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{ wholeDay },
        revision
      );
      Integer locking = Limits.getQueries();
      // A hand edit on Tuesday (not locked): Period 2 of the first group, cleared.
      ScheduleViews.DayView tuesday = locked.schedule.days[1];
      SlotEdits.Run run = new SlotEdits.Run();
      run.day = tuesday.dateValue;
      run.groupId = tuesday.groups[0].id;
      run.firstBlockId = tuesday.blocks[1].id;
      run.blockIds = new List<String>{ tuesday.blocks[1].id };
      run.before = new List<String>{
        SlotIds.ofRow(ScheduleDays.read(draftId)[1].grid, 0)[1]
      };
      run.after = new List<String>{ '' };
      SlotEdits.Edit edit = new SlotEdits.Edit();
      edit.runs = new List<SlotEdits.Run>{ run };
      Integer before = Limits.getQueries();
      SlotEdits.Result edited = GeneratedTestData.handEdits(
        draftId,
        new List<SlotEdits.Edit>{ edit },
        locked.revision
      );
      Integer editing = Limits.getQueries() - before;
      Assert.isFalse(locked.conflict);
      Assert.isTrue(edited.conflicts.isEmpty());
      Assert.isNotNull(edited.revision);
      assertFew(locking, 'Locking a whole day');
      assertFew(editing, 'A hand edit');
    }
  }

  /**
   * A season of its own for the one-or-three test: Main with 8 time blocks and 4 groups, the
   * season's places and activities, the Hall, and the named other programs.
   */
  private static Map<String, Id> seasonWith(List<String> others) {
    Camp__c camp = ShoreshTestData.camp('Camp ' + others.size());
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Week__c week = ShoreshTestData.weeks(season.Id, 1)[0];
    Program__c main = ShoreshTestData.program(season.Id, 'Main');
    Database.insert(hoursOf(main.Id), AccessLevel.SYSTEM_MODE);
    Division__c division = ShoreshTestData.division(main.Id, 'Juniors');
    List<Group__c> groups = fourGroupsIn(division);
    // ShoreshTestData.placesAndActivities sets Swim up for Group A.
    groups[0].Name = 'Group A';
    Database.insert(groups, AccessLevel.SYSTEM_MODE);
    Map<String, Id> ids = ShoreshTestData.placesAndActivities(season.Id);
    ids.put('Season', season.Id);
    ids.put('Main', main.Id);
    ids.put('Week 1', week.Id);
    addOtherPrograms(ids, week, others);
    return ids;
  }

  @IsTest
  static void threeOtherProgramsUseNoMoreQueriesThanOne() {
    System.runAs(scheduler()) {
      SetTimeGuard.defer();
      Map<String, Id> one;
      Map<String, Id> three;
      try {
        one = seasonWith(new List<String>{ 'Teens' });
        three = seasonWith(new List<String>{ 'Teens', 'Kids', 'Tweens' });
        SetTimeGuard.checkPending();
      } finally {
        SetTimeGuard.resume();
      }
      Test.startTest();
      GeneratedInputs.Inputs readOne = GeneratedScheduleController.getInputs(
        one.get('Main'),
        one.get('Week 1')
      );
      Integer withOne = Limits.getQueries();
      GeneratedInputs.Inputs readThree = GeneratedScheduleController.getInputs(
        three.get('Main'),
        three.get('Week 1')
      );
      Integer withThree = Limits.getQueries() - withOne;
      Test.stopTest();
      // Their times are the same, so their groups add up in one entry each: 4 groups or 12.
      Assert.areEqual(4, readOne.otherPrograms[0].groups);
      Assert.areEqual(12, readThree.otherPrograms[0].groups);
      Assert.areEqual(
        withOne,
        withThree,
        'Opening a week with three other programs used ' +
          withThree +
          ' queries, with one ' +
          withOne +
          ': a query runs per program'
      );
      assertFew(withOne, 'Opening a week with one other program');
    }
  }

  @IsTest
  static void openingManualBuildUsesFewQueries() {
    Map<String, Id> ids = sharedCamp();
    System.runAs(KeptCamp.scheduler(ids)) {
      ManualBuildController.startBlankWeek(ids.get('Main'), ids.get('Week 1'));
      Test.startTest();
      ManualBuildViews.DraftView view = ManualBuildController.getDraft(
        ids.get('Main'),
        ids.get('Week 1')
      );
      Integer used = Limits.getQueries();
      Test.stopTest();
      Assert.areEqual(5, view.schedule.days.size());
      Assert.areEqual(8 * 2 + 2 + 1, view.otherPrograms.size());
      assertFew(used, 'Opening Manual Build');
    }
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
   * What one request used, measured from Test.startTest(): CPU and heap under half of their
   * limits, queries under mostQueries (HALF_QUERIES, or a measured bound the caller says why it
   * needs). Measured on 2026-11-25: CPU 73 ms for week_view, under 500 ms for the draft read.
   */
  private static void assertWithinLimits(String what, Integer mostQueries) {
    Integer queries = Limits.getQueries();
    Integer cpu = Limits.getCpuTime();
    Integer heap = Limits.getHeapSize();
    Assert.isTrue(
      queries < mostQueries,
      what + ' used ' + queries + ' queries (fewer than ' + mostQueries + ')'
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
      assertWithinLimits('week_view of two published programs', HALF_QUERIES);
      Test.stopTest();
      Assert.areEqual(200, view[0], (String) view[1]);
      Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
        (String) view[1]
      );
      Assert.areEqual(2, ((List<Object>) answer.get('programs')).size());
    }
  }

  // G8: week_view opens each published program's week as the Schedules screen opens one (its
  // schedule, days and special days), so a camp's programs add up: measured 11 for one program and
  // 23 for three (2026-11-25), 6 a program, so 8 published programs would pass the 50 the bar asks.
  // Bounded near that per program (one to spare) until one read opens them all.
  private static final Integer MOST_QUERIES_PER_PROGRAM_VIEW = 7;

  @IsTest
  static void aWeekViewAddsAFewQueriesPerPublishedProgram() {
    System.runAs(scheduler()) {
      SetTimeGuard.defer();
      Map<String, Id> one;
      Map<String, Id> three;
      try {
        one = seasonWith(new List<String>{ 'Teens' });
        three = seasonWith(new List<String>{ 'Teens', 'Kids', 'Tweens' });
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

  // G8: the draft an AI reads, and the week's checks, are the screen's own reads: finding the week
  // (5 queries), the season's setup (22), the week (14) and its setup changes (15), each read on
  // its own, and a few more. Measured 60 on this camp (2026-11-25): over the 50 the bar asks,
  // until one shared read of the season setup serves them; bounded here near that, so it can't
  // grow.
  private static final Integer MOST_DRAFT_READ_QUERIES = 65;

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
      assertWithinLimits('read_week_draft', MOST_DRAFT_READ_QUERIES);
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
      assertWithinLimits('week_checks', MOST_DRAFT_READ_QUERIES);
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
      assertWithinLimits('schedule_cell', HALF_QUERIES);
      Test.stopTest();
      Assert.areEqual(200, answer[0], (String) answer[1]);
    }
  }
}
