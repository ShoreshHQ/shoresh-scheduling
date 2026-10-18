/**
 * Slots already placed in a week's drafts (desktop ExclusionConfirmDialog's count): by group, by
 * activity (each block of a longer one counts), and by location (its activities' cells), in
 * Manual Build and Generated Schedule drafts only. Synthetic camp (ShoreshTestData).
 */
@IsTest
private class PlacedInWeeksTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);

  private class Camp {
    Map<String, Id> ids = new Map<String, Id>();
    List<Week__c> weeks;
  }

  private static Camp camp() {
    Camp c = new Camp();
    Season__c season = ShoreshTestData.fullSeason(
      ShoreshTestData.camp('Test Camp').Id
    );
    c.ids = ShoreshTestData.placesAndActivities(season.Id);
    c.weeks = [
      SELECT Id, StartDate__c
      FROM Week__c
      WHERE Season__c = :season.Id
      ORDER BY StartDate__c
    ];
    Program__c program = [
      SELECT Id
      FROM Program__c
      WHERE Season__c = :season.Id
    ];
    c.ids.put('Main', program.Id);
    for (Group__c grp : [
      SELECT Id, Name
      FROM Group__c
      WHERE Division__r.Program__c = :program.Id
    ]) {
      c.ids.put(grp.Name, grp.Id);
    }
    return c;
  }

  /** Swim for Group A in both blocks of Monday; nothing for Group B. kind: Status/Origin. */
  private static void draftWithSwim(Camp c, Week__c week, String kind) {
    List<String> statusAndOrigin = kind.split('/');
    Schedule__c schedule = new Schedule__c(
      Program__c = c.ids.get('Main'),
      Week__c = week.Id,
      Name = 'Draft',
      Status__c = statusAndOrigin[0],
      Origin__c = statusAndOrigin[1]
    );
    if (schedule.Status__c == 'Version') {
      schedule.VersionReason__c = 'Imported';
    }
    Database.insert(schedule, AccessLevel.SYSTEM_MODE);
    List<TimeBlock__c> blocks = [
      SELECT Id, Name
      FROM TimeBlock__c
      WHERE Program__c = :c.ids.get('Main')
      ORDER BY StartTime__c
    ];
    ScheduleGrid grid = new ScheduleGrid();
    for (TimeBlock__c block : blocks) {
      grid.blocks.add(
        new ScheduleGrid.Block(block.Id, block.Name).at('09:00', '09:45')
      );
    }
    grid.items.add(new ScheduleGrid.Item('A', c.ids.get('Swim'), 'Swim'));
    grid.groups.add(new ScheduleGrid.GroupRef(c.ids.get('Group A'), 'Group A'));
    grid.groups.add(new ScheduleGrid.GroupRef(c.ids.get('Group B'), 'Group B'));
    grid.rows.add(new List<String>{ '1', '^' });
    grid.rows.add(new List<String>{ '', '' });
    ScheduleDaySaves.write(
      schedule.Id,
      new List<ScheduleDaySaves.DaySave>{
        new ScheduleDaySaves.DaySave(week.StartDate__c, grid, null)
      }
    );
  }

  private static RunsIn.WeekOff ask(Id target, Id week) {
    RunsIn.WeekOff off = new RunsIn.WeekOff();
    off.target = target;
    off.week = week;
    return off;
  }

  private static Map<String, Integer> counted(
    Camp c,
    List<RunsIn.WeekOff> asks
  ) {
    Map<Id, String> names = new Map<Id, String>();
    for (String name : c.ids.keySet()) {
      names.put(c.ids.get(name), name);
    }
    Map<String, Integer> result = new Map<String, Integer>();
    for (PlacedInWeeks.Placed placed : RunsInController.placedInWeeks(asks)) {
      String weekName = placed.week == c.weeks[0].Id ? 'Week 1' : 'Week 2';
      result.put(names.get(placed.target) + ' ' + weekName, placed.cells);
    }
    return result;
  }

  @IsTest
  static void countsEachBlockByGroupActivityAndLocation() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      draftWithSwim(c, c.weeks[0], 'Draft/Manual');
      Id week1 = c.weeks[0].Id;
      Test.startTest();
      Map<String, Integer> found = counted(
        c,
        new List<RunsIn.WeekOff>{
          ask(c.ids.get('Group A'), week1),
          ask(c.ids.get('Group B'), week1),
          ask(c.ids.get('Swim'), week1),
          ask(c.ids.get('Pool'), week1),
          ask(c.ids.get('Gym'), week1),
          ask(c.ids.get('Group A'), c.weeks[1].Id)
        }
      );
      Test.stopTest();
      Assert.areEqual(
        new Map<String, Integer>{
          'Group A Week 1' => 2,
          'Swim Week 1' => 2,
          'Pool Week 1' => 2
        },
        found
      );
    }
  }

  @IsTest
  static void aGeneratedDraftCountsAndAVersionDoesNot() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      draftWithSwim(c, c.weeks[0], 'Version/Imported');
      draftWithSwim(c, c.weeks[1], 'Draft/Generated');
      Test.startTest();
      Map<String, Integer> found = counted(
        c,
        new List<RunsIn.WeekOff>{
          ask(c.ids.get('Group A'), c.weeks[0].Id),
          ask(c.ids.get('Group A'), c.weeks[1].Id)
        }
      );
      Test.stopTest();
      Assert.areEqual(new Map<String, Integer>{ 'Group A Week 2' => 2 }, found);
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
        RunsInController.placedInWeeks(
          new List<RunsIn.WeekOff>{ ask(c.ids.get('Group A'), c.weeks[0].Id) }
        );
        Assert.fail('An outsider read the drafts.');
      } catch (AuraHandledException e) {
        Assert.isFalse(e.getMessage().contains('__c'), e.getMessage());
      }
    }
  }
}
