/**
 * What a bunk is already placed in, asked before it moves to another division: its activity cells
 * (each block of a longer one counts) in its program's Manual Build and Generated Schedule drafts,
 * not in versions, and not another bunk's. Synthetic camp (ShoreshTestData).
 */
@IsTest
private class GroupPlacementsTest {
  private class Camp {
    Map<String, Id> ids = new Map<String, Id>();
    List<Week__c> weeks;
    // How many days of each week a schedule written by write() has.
    Integer daysPerWeek = 1;
  }

  private static Camp camp() {
    Camp c = new Camp();
    Season__c season = ShoreshTestData.fullSeason(
      ShoreshTestData.camp('Test Camp').Id
    );
    c.ids.putAll(ShoreshTestData.lastSeasonIds);
    c.ids.putAll(ShoreshTestData.placesAndActivities(season.Id));
    c.weeks = [
      SELECT Id, StartDate__c
      FROM Week__c
      WHERE Season__c = :season.Id
      ORDER BY StartDate__c
    ];
    return c;
  }

  private static Schedule__c schedule(Camp c, Week__c week, String kind) {
    List<String> statusAndOrigin = kind.split('/');
    Schedule__c schedule = new Schedule__c(
      Program__c = c.ids.get('Main'),
      Week__c = week.Id,
      Name = kind,
      Status__c = statusAndOrigin[0],
      Origin__c = statusAndOrigin[1]
    );
    if (schedule.Status__c == 'Version') {
      schedule.VersionReason__c = 'SavedByHand';
    }
    return schedule;
  }

  /**
   * A day of the program's two blocks: Group A has the first activity in Period 1 carrying on
   * into Lunch; Group B has the second in Period 1.
   */
  private static ScheduleGrid day(Camp c, List<String> activities) {
    String first = activities[0];
    String second = activities[1];
    ScheduleGrid grid = new ScheduleGrid();
    grid.blocks.add(
      new ScheduleGrid.Block(c.ids.get('Period 1'), 'Period 1')
        .at('09:00', '09:45')
    );
    grid.blocks.add(
      new ScheduleGrid.Block(c.ids.get('Lunch'), 'Lunch').at('12:00', '12:45')
    );
    grid.items.add(new ScheduleGrid.Item('A', c.ids.get(first), first));
    grid.items.add(new ScheduleGrid.Item('A', c.ids.get(second), second));
    grid.groups.add(new ScheduleGrid.GroupRef(c.ids.get('Group A'), 'Group A'));
    grid.groups.add(new ScheduleGrid.GroupRef(c.ids.get('Group B'), 'Group B'));
    grid.rows.add(new List<String>{ '1', '^' });
    grid.rows.add(new List<String>{ '2', '' });
    return grid;
  }

  /** Each schedule gets the same day on each of the first c.daysPerWeek days of its week. */
  private static void write(
    Camp c,
    List<Schedule__c> schedules,
    List<String> activities
  ) {
    Database.insert(schedules, AccessLevel.SYSTEM_MODE);
    Map<Id, Date> starts = new Map<Id, Date>();
    for (Week__c week : c.weeks) {
      starts.put(week.Id, week.StartDate__c);
    }
    Map<Id, List<ScheduleDaySaves.DaySave>> saves = new Map<Id, List<ScheduleDaySaves.DaySave>>();
    for (Schedule__c schedule : schedules) {
      List<ScheduleDaySaves.DaySave> week = new List<ScheduleDaySaves.DaySave>();
      for (Integer d = 0; d < c.daysPerWeek; d++) {
        week.add(
          new ScheduleDaySaves.DaySave(
            starts.get(schedule.Week__c).addDays(d),
            day(c, activities),
            null
          )
        );
      }
      saves.put(schedule.Id, week);
    }
    ScheduleDaySaves.writeAll(saves);
  }

  private static Map<String, Integer> named(Camp c, GroupPlacements.Result r) {
    Map<Id, String> names = new Map<Id, String>();
    for (String name : c.ids.keySet()) {
      names.put(c.ids.get(name), name);
    }
    Map<String, Integer> found = new Map<String, Integer>();
    for (GroupPlacements.Placed placed : r.placed) {
      found.put(names.get(placed.activity), placed.cells);
    }
    return found;
  }

  @IsTest
  static void countsTheGroupsActivityCellsInDraftsOnly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      write(
        c,
        new List<Schedule__c>{
          schedule(c, c.weeks[0], 'Draft/Manual'),
          schedule(c, c.weeks[1], 'Draft/Generated')
        },
        new List<String>{ 'Swim', 'Gym games' }
      );
      // A saved version is history: it is not counted.
      write(
        c,
        new List<Schedule__c>{ schedule(c, c.weeks[2], 'Version/Manual') },
        new List<String>{ 'Soccer', 'Gym games' }
      );
      Test.startTest();
      GroupPlacements.Result groupA = SetupTablesController.groupPlacements(
        c.ids.get('Group A')
      );
      GroupPlacements.Result groupB = SetupTablesController.groupPlacements(
        c.ids.get('Group B')
      );
      Test.stopTest();
      Assert.isTrue(groupA.complete);
      // Swim two blocks long, in two drafts.
      Assert.areEqual(
        new Map<String, Integer>{ 'Swim' => 4 },
        named(c, groupA)
      );
      Assert.areEqual(
        new Map<String, Integer>{ 'Gym games' => 2 },
        named(c, groupB)
      );
    }
  }

  @IsTest
  static void aWholeSeasonOfDraftsStaysWellInsideTheQueryLimit() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      List<Schedule__c> drafts = new List<Schedule__c>();
      for (Week__c week : c.weeks) {
        drafts.add(schedule(c, week, 'Draft/Manual'));
        drafts.add(schedule(c, week, 'Draft/Generated'));
      }
      // 6 weeks, 2 drafts each, 5 days: 60 days.
      c.daysPerWeek = 5;
      write(c, drafts, new List<String>{ 'Swim', 'Soccer' });
      Test.startTest();
      Integer before = Limits.getQueries();
      GroupPlacements.Result result = SetupTablesController.groupPlacements(
        c.ids.get('Group A')
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.areEqual(
        new Map<String, Integer>{ 'Swim' => 120 },
        named(c, result)
      );
      Assert.isTrue(result.complete);
      // The bunk, the days, then the text 25 days at a time.
      Assert.isTrue(used <= 5, 'Used ' + used + ' queries.');
    }
  }

  @IsTest
  static void pastItsBudgetItSaysTheCountIsNotComplete() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      c.daysPerWeek = 3;
      write(
        c,
        new List<Schedule__c>{ schedule(c, c.weeks[0], 'Draft/Manual') },
        new List<String>{ 'Swim', 'Soccer' }
      );
      GroupPlacements.partsAtOnce = 1;
      GroupPlacements.queryBudget = 2;
      Test.startTest();
      GroupPlacements.Result result = GroupPlacements.of(c.ids.get('Group A'));
      Test.stopTest();
      Assert.isFalse(result.complete);
      Assert.areEqual(
        new Map<String, Integer>{ 'Swim' => 4 },
        named(c, result)
      );
    }
  }

  @IsTest
  static void anythingButAGroupHasNoPlacements() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Test.startTest();
      GroupPlacements.Result result = GroupPlacements.of(c.ids.get('Juniors'));
      Test.stopTest();
      Assert.isTrue(result.placed.isEmpty());
      Assert.isTrue(GroupPlacements.of(null).placed.isEmpty());
    }
  }

  @IsTest
  static void someoneWithoutShoreshIsRefusedInPlainWords() {
    Camp c;
    System.runAs(ShoreshTestData.scheduler()) {
      c = camp();
    }
    System.runAs(ShoreshTestData.outsider()) {
      try {
        SetupTablesController.groupPlacements(c.ids.get('Group A'));
        Assert.fail('An outsider read the drafts.');
      } catch (AuraHandledException e) {
        Assert.isFalse(e.getMessage().contains('__c'), e.getMessage());
      }
    }
  }
}
