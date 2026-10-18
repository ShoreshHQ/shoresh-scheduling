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
  // in shoresh-test (2026-10-18), on the smaller camp: opening a week 18 (not generated yet) or
  // 12, the first Generate 21, Fill the open cells 14, a Rebuild with its version 19. The bound
  // is per request, whatever the week's size: no query runs per day, group or cell. Other
  // programs (G5) add at most 4 to opening a week, whatever their number (OtherProgramUse).
  private static final Integer MOST_QUERIES = 25;

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
    otherProgram(ids, season.Id, week);
    SetTimeGuard.checkPending();
    GeneratedTestData.ids = ids;
    return ids;
  }

  /**
   * Teens, sharing the season's places (G5): 4 groups, 8 time blocks half an hour later than
   * Main's, a fixed and a recurring activity in the Hall, and a published week with Swim in
   * every cell.
   */
  private static void otherProgram(
    Map<String, Id> ids,
    Id seasonId,
    Week__c week
  ) {
    Program__c teens = ShoreshTestData.program(seasonId, 'Teens');
    List<TimeBlock__c> blocks = new List<TimeBlock__c>();
    for (Integer hour = 8; hour < 16; hour++) {
      blocks.add(
        new TimeBlock__c(
          Program__c = teens.Id,
          Name = 'Hour ' + (hour - 7),
          StartTime__c = Time.newInstance(hour, 30, 0, 0),
          EndTime__c = Time.newInstance(hour + 1, 15, 0, 0),
          PartOfDay__c = hour < 12 ? 'Morning' : 'Afternoon',
          SortOrder__c = hour
        )
      );
    }
    Database.insert(blocks, AccessLevel.SYSTEM_MODE);
    Division__c division = ShoreshTestData.division(teens.Id, 'Teen groups');
    List<Group__c> groups = new List<Group__c>();
    for (Integer g = 0; g < 4; g++) {
      groups.add(
        new Group__c(
          Division__c = division.Id,
          Name = 'Teen ' + (g + 1),
          Availability__c = 'AllDay',
          SortOrder__c = g
        )
      );
    }
    Database.insert(groups, AccessLevel.SYSTEM_MODE);
    Location__c hall = new Location__c(
      Season__c = seasonId,
      Name = 'Hall',
      GroupsThatFit__c = 10
    );
    Database.insert(hall, AccessLevel.SYSTEM_MODE);
    Database.insert(
      new FixedActivity__c(
        Program__c = teens.Id,
        Name = 'Assembly',
        TimeBlock__c = blocks[0].Id,
        Length__c = 1,
        Location__c = hall.Id
      ),
      AccessLevel.SYSTEM_MODE
    );
    Database.insert(
      new RecurringActivity__c(
        Program__c = teens.Id,
        Name = 'Lunch',
        TimeBlock__c = blocks[4].Id,
        Length__c = 1,
        Location__c = hall.Id,
        Monday__c = true,
        Wednesday__c = true
      ),
      AccessLevel.SYSTEM_MODE
    );
    Schedule__c published = new Schedule__c(
      Program__c = teens.Id,
      Week__c = week.Id,
      Name = 'Published',
      Status__c = 'Published',
      Origin__c = 'Manual'
    );
    Database.insert(published, AccessLevel.SYSTEM_MODE);
    // Published Monday and Tuesday; the other days count from setup.
    List<ScheduleDaySaves.DaySave> days = new List<ScheduleDaySaves.DaySave>();
    for (Integer d = 0; d < 2; d++) {
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
      days.add(
        new ScheduleDaySaves.DaySave(week.StartDate__c.addDays(d), grid, null)
      );
    }
    ScheduleDaySaves.write(published.Id, days);
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
      // Teens: Swim at the Pool in each of 8 hours on its published Monday and Tuesday; the
      // Hall's Assembly on Wednesday and Thursday (Teens doesn't run Fridays), and Lunch on
      // Wednesday.
      Assert.areEqual(8 * 2 + 2 + 1, read.otherPrograms.size());
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
      Test.stopTest();
      Assert.isFalse(result.conflict);
      assertFew(used, 'The first Generate');
    }
  }

  @IsTest
  static void aRebuildUsesFewQueries() {
    System.runAs(ShoreshTestData.scheduler()) {
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
      Assert.isFalse(again.otherPrograms.isEmpty());
      assertFew(used, 'A Rebuild (with its version)');
      assertFew(reading, 'Opening a generated week');
    }
  }
}
