/**
 * Generated Schedule stays well inside Salesforce's limits on a realistic week: 8 groups (two
 * divisions), 5 days, 8 time blocks, a fixed activity every morning, and another program sharing
 * the season's places (fixed and recurring activities, and a published week). Opening the week and each
 * kind of save use a small, fixed number of queries, whatever the size of the week (no query per
 * day, group or cell). Synthetic camp.
 */
@IsTest
private class GeneratedLimitsTest {
  // Each call is one request from the screen: Salesforce allows 100 queries in one. Measured
  // in shoresh-test (2026-10-18) on this camp with its two other programs: opening a week 22
  // (not generated yet) or 16 (generated), opening Manual Build 22, the first Generate 21. Without
  // them (the Rebuild test): a Rebuild with its version 19, opening the generated week 13. The
  // bound is per request, whatever the week's size: no query runs per day, group or cell. Other
  // programs (G5) add at most 4 to opening a week, whatever their number (OtherProgramUse;
  // threeOtherProgramsUseNoMoreQueriesThanOne).
  private static final Integer MOST_QUERIES = 25;
  // Whether the camp has the two other programs. The Rebuild test leaves them out: its setup
  // (a first Generate and two reads) runs before Test.startTest() and would not leave room for
  // them; saves don't read other programs, and opening a week is measured with them below.
  private static Boolean withOtherPrograms = true;

  private static Map<String, Id> bigCamp() {
    SetTimeGuard.defer();
    try {
      return bigCampDeferred();
    } finally {
      SetTimeGuard.resume();
    }
  }

  private static Map<String, Id> bigCampDeferred() {
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
          // ShoreshTestData.placesAndActivities sets Swim up for Group A.
          Name = g == 0 ? 'Group A' : 'Bunk ' + (g + 1),
          Availability__c = 'AllDay',
          SortOrder__c = g
        )
      );
    }
    Database.insert(groups, AccessLevel.SYSTEM_MODE);
    Map<String, Id> ids = ShoreshTestData.placesAndActivities(season.Id);
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
    if (withOtherPrograms) {
      addOtherPrograms(ids, season.Id, week);
    }
    SetTimeGuard.checkPending();
    GeneratedTestData.ids = ids;
    return ids;
  }

  // Two other programs, so a query run once per program would show.
  private static void addOtherPrograms(
    Map<String, Id> ids,
    Id seasonId,
    Week__c week
  ) {
    addOtherPrograms(ids, seasonId, week, new List<String>{ 'Teens', 'Kids' });
  }

  private static void addOtherPrograms(
    Map<String, Id> ids,
    Id seasonId,
    Week__c week,
    List<String> names
  ) {
    Location__c hall = new Location__c(
      Season__c = seasonId,
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
    System.runAs(ShoreshTestData.scheduler()) {
      bigCamp();
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
    System.runAs(ShoreshTestData.scheduler()) {
      bigCamp();
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
    System.runAs(ShoreshTestData.scheduler()) {
      withOtherPrograms = false;
      bigCamp();
      Id draftId = GeneratedTestData.save(
          built(GeneratedTestData.inputs(), GeneratedSaves.GENERATE)
        )
        .scheduleId;
      GeneratedWeek.Save rebuild = GeneratedTestData.request(
        GeneratedTestData.inputs(),
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
  static void aLockAndAHandEditUseFewQueries() {
    System.runAs(ShoreshTestData.scheduler()) {
      bigCamp();
      Id draftId = GeneratedTestData.save(
          built(GeneratedTestData.inputs(), GeneratedSaves.GENERATE)
        )
        .scheduleId;
      String revision = GeneratedDrafts.revisionOf(ScheduleDays.read(draftId));
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
      SlotEdits.Result edited = GeneratedScheduleController.saveSlots(
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
    addOtherPrograms(ids, season.Id, week, others);
    return ids;
  }

  @IsTest
  static void threeOtherProgramsUseNoMoreQueriesThanOne() {
    System.runAs(ShoreshTestData.scheduler()) {
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
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = bigCamp();
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
}
