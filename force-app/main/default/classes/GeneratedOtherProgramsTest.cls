/**
 * Other programs count against places and activities (ADR 0010 G5, Greg's decision 6), as a
 * scheduler: what Generated Schedule's inputs and Manual Build's draft send for another program
 * of the season. Its published schedule counts cell by cell, at its own clock times; on a day it
 * has none, its fixed and recurring activities count where setup puts them; drafts never count;
 * a group away, a place closed or an activity off that week doesn't count. The engine's use of
 * them (placing elsewhere, the dots) is tested in Jest (c/shoreshGeneratedWeek, c/shoreshEngine).
 *
 * Camp: GeneratedTestData's (Main), plus Teens: Teen 1 and Teen 2, all day, with its own time
 * blocks Swim hour (10:30 to 11:15), Afternoon (13:00 to 13:45) and Rest hour (14:00 to 14:45),
 * Monday to Thursday.
 */
@IsTest
private class GeneratedOtherProgramsTest {
  private static final Date MONDAY = GeneratedTestData.MONDAY;

  /**
   * The camp, with Teens. The clash check waits (SetTimeGuard) until checked(), once the test's
   * own fixed and recurring activities are in: it runs once, at the end, as a screen save does,
   * so the setup fits in one test's queries.
   */
  private static Map<String, Id> campWithTeens() {
    SetTimeGuard.defer();
    Map<String, Id> ids = GeneratedTestData.camp();
    Program__c teens = ShoreshTestData.program(ids.get('Season'), 'Teens');
    ids.put('Teens', teens.Id);
    List<TimeBlock__c> blocks = new List<TimeBlock__c>{
      new TimeBlock__c(
        Program__c = teens.Id,
        Name = 'Swim hour',
        StartTime__c = Time.newInstance(10, 30, 0, 0),
        EndTime__c = Time.newInstance(11, 15, 0, 0),
        PartOfDay__c = 'Morning',
        SortOrder__c = 1
      ),
      new TimeBlock__c(
        Program__c = teens.Id,
        Name = 'Afternoon',
        StartTime__c = Time.newInstance(13, 0, 0, 0),
        EndTime__c = Time.newInstance(13, 45, 0, 0),
        PartOfDay__c = 'Afternoon',
        SortOrder__c = 2
      ),
      new TimeBlock__c(
        Program__c = teens.Id,
        Name = 'Rest hour',
        StartTime__c = Time.newInstance(14, 0, 0, 0),
        EndTime__c = Time.newInstance(14, 45, 0, 0),
        PartOfDay__c = 'Afternoon',
        SortOrder__c = 3
      )
    };
    Database.insert(blocks, AccessLevel.SYSTEM_MODE);
    Division__c division = ShoreshTestData.division(teens.Id, 'Teen groups');
    ids.put('Teen groups', division.Id);
    List<Group__c> groups = new List<Group__c>{
      new Group__c(
        Division__c = division.Id,
        Name = 'Teen 1',
        Availability__c = 'AllDay',
        SortOrder__c = 1
      ),
      new Group__c(
        Division__c = division.Id,
        Name = 'Teen 2',
        Availability__c = 'AllDay',
        SortOrder__c = 2
      )
    };
    Database.insert(groups, AccessLevel.SYSTEM_MODE);
    for (TimeBlock__c block : blocks) {
      ids.put(block.Name, block.Id);
    }
    for (Group__c grp : groups) {
      ids.put(grp.Name, grp.Id);
    }
    return ids;
  }

  /** The clash check on everything saved since campWithTeens(). */
  private static void checked() {
    try {
      SetTimeGuard.checkPending();
    } finally {
      SetTimeGuard.resume();
    }
  }

  private static void insertAll(List<SObject> records) {
    Database.insert(records, AccessLevel.SYSTEM_MODE);
  }

  /**
   * A Teens schedule of Week 1 with one day: Teen 1 swimming in Swim hour, Teen 2 nothing.
   */
  private static Id teensSchedule(
    Map<String, Id> ids,
    String status,
    Date day
  ) {
    Schedule__c schedule = new Schedule__c(
      Program__c = ids.get('Teens'),
      Week__c = ids.get('Week 1'),
      Name = status == 'Published' ? 'Published' : 'Teens draft',
      Status__c = status,
      Origin__c = 'Manual'
    );
    Database.insert(schedule, AccessLevel.SYSTEM_MODE);
    ScheduleGrid grid = new ScheduleGrid();
    grid.blocks.add(
      new ScheduleGrid.Block(ids.get('Swim hour'), 'Swim hour')
        .at('10:30', '11:15')
    );
    grid.blocks.add(
      new ScheduleGrid.Block(ids.get('Afternoon'), 'Afternoon')
        .at('13:00', '13:45')
    );
    grid.blocks.add(
      new ScheduleGrid.Block(ids.get('Rest hour'), 'Rest hour')
        .at('14:00', '14:45')
    );
    grid.groups.add(new ScheduleGrid.GroupRef(ids.get('Teen 1'), 'Teen 1'));
    grid.groups.add(new ScheduleGrid.GroupRef(ids.get('Teen 2'), 'Teen 2'));
    grid.items.add(new ScheduleGrid.Item('A', ids.get('Swim'), 'Swim'));
    grid.rows.add(new List<String>{ '1', '', '' });
    grid.rows.add(new List<String>{ '', '', '' });
    ScheduleDaySaves.write(
      schedule.Id,
      new List<ScheduleDaySaves.DaySave>{
        new ScheduleDaySaves.DaySave(day, grid, null)
      }
    );
    return schedule.Id;
  }

  /** "2026-06-29 10:30-11:15 Pool Swim x1", with names for Ids, for readable comparisons. */
  private static List<String> described(
    List<OtherProgramUse.Entry> entries,
    Map<String, Id> ids
  ) {
    Map<Id, String> names = new Map<Id, String>();
    for (String name : ids.keySet()) {
      names.put(ids.get(name), name);
    }
    List<String> lines = new List<String>();
    for (OtherProgramUse.Entry entry : entries) {
      lines.add(
        String.valueOf(entry.dateValue) +
          ' ' +
          entry.startTime +
          '-' +
          entry.endTime +
          ' ' +
          (entry.locationId == null ? '-' : names.get(entry.locationId)) +
          ' ' +
          (entry.activityId == null ? '-' : names.get(entry.activityId)) +
          ' x' +
          entry.groups
      );
    }
    return lines;
  }

  @IsTest
  static void aSeasonWithOneProgramSendsNone() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      Assert.isTrue(GeneratedTestData.inputs().otherPrograms.isEmpty());
    }
  }

  @IsTest
  static void aPublishedScheduleCountsAtItsOwnTimesAndADraftDoesNot() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithTeens();
      // Teens' published Monday: Teen 1 swims 10:30 to 11:15, overlapping Main's Period 2
      // (10:00 to 10:45), and fills the Pool (fits 1). A Teens draft has Teen 1 swimming on Tuesday.
      checked();
      teensSchedule(ids, 'Published', MONDAY);
      teensSchedule(ids, 'Draft', MONDAY.addDays(1));
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();
      Assert.areEqual(
        new List<String>{ '2026-06-29 10:30-11:15 Pool Swim x1' },
        described(read.otherPrograms, ids)
      );
    }
  }

  @IsTest
  static void fixedAndRecurringActivitiesCountOnDaysWithoutAPublishedSchedule() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithTeens();
      // Teens' fixed lunch at the Gym in Rest hour, every day; Canoe (recurring) on Field A,
      // two blocks from Swim hour, Monday and Tuesday, for Teen 1 only.
      RecurringActivity__c canoe = new RecurringActivity__c(
        Program__c = ids.get('Teens'),
        Name = 'Canoe',
        TimeBlock__c = ids.get('Swim hour'),
        Length__c = 2,
        Location__c = ids.get('Field A'),
        Monday__c = true,
        Tuesday__c = true
      );
      insertAll(
        new List<SObject>{
          new FixedActivity__c(
            Program__c = ids.get('Teens'),
            Name = 'Teen lunch',
            TimeBlock__c = ids.get('Rest hour'),
            Length__c = 1,
            Location__c = ids.get('Gym')
          ),
          canoe
        }
      );
      Database.insert(
        new Coverage__c(
          RecurringActivity__c = canoe.Id,
          Group__c = ids.get('Teen 1'),
          Season__c = ids.get('Season')
        ),
        AccessLevel.SYSTEM_MODE
      );
      checked();
      // Monday is published (its grid already holds what Teens does then), so setup counts
      // only from Tuesday.
      teensSchedule(ids, 'Published', MONDAY);
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();
      Assert.areEqual(
        new List<String>{
          '2026-06-29 10:30-11:15 Pool Swim x1',
          '2026-06-30 10:30-11:15 Field A - x1',
          '2026-06-30 13:00-13:45 Field A - x1',
          '2026-06-30 14:00-14:45 Gym - x2',
          '2026-07-01 14:00-14:45 Gym - x2',
          '2026-07-02 14:00-14:45 Gym - x2'
        },
        described(read.otherPrograms, ids)
      );
    }
  }

  @IsTest
  static void aGroupAwayAPlaceClosedOrAnActivityOffThatWeekDoesNotCount() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithTeens();
      FixedActivity__c lunch = new FixedActivity__c(
        Program__c = ids.get('Teens'),
        Name = 'Teen lunch',
        TimeBlock__c = ids.get('Afternoon'),
        Length__c = 1,
        Location__c = ids.get('Gym')
      );
      FixedActivity__c dip = new FixedActivity__c(
        Program__c = ids.get('Teens'),
        Name = 'Morning dip',
        TimeBlock__c = ids.get('Swim hour'),
        Length__c = 1,
        Location__c = ids.get('Gym')
      );
      FixedActivity__c drills = new FixedActivity__c(
        Program__c = ids.get('Teens'),
        Name = 'Drills',
        TimeBlock__c = ids.get('Rest hour'),
        Length__c = 1,
        Location__c = ids.get('Field A')
      );
      insertAll(new List<SObject>{ lunch, dip, drills });
      // Week 1: Teen 2 is away, Morning dip is off, Field A is closed.
      Id week = ids.get('Week 1');
      Database.insert(
        new List<WeekException__c>{
          new WeekException__c(Week__c = week, Group__c = ids.get('Teen 2')),
          new WeekException__c(Week__c = week, FixedActivity__c = dip.Id),
          new WeekException__c(Week__c = week, Location__c = ids.get('Field A'))
        },
        AccessLevel.SYSTEM_MODE
      );
      checked();
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();
      Assert.areEqual(
        new List<String>{
          '2026-06-29 13:00-13:45 Gym - x1',
          '2026-06-30 13:00-13:45 Gym - x1',
          '2026-07-01 13:00-13:45 Gym - x1',
          '2026-07-02 13:00-13:45 Gym - x1'
        },
        described(read.otherPrograms, ids)
      );
    }
  }

  @IsTest
  static void manualBuildGetsTheSameAsTheEngine() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithTeens();
      insertAll(
        new List<SObject>{
          new FixedActivity__c(
            Program__c = ids.get('Teens'),
            Name = 'Teen lunch',
            TimeBlock__c = ids.get('Rest hour'),
            Length__c = 1,
            Location__c = ids.get('Gym')
          )
        }
      );
      checked();
      teensSchedule(ids, 'Published', MONDAY);
      Test.startTest();
      ManualBuildViews.DraftView view = ManualBuildController.startBlankWeek(
        ids.get('Main'),
        ids.get('Week 1')
      );
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();
      Assert.areEqual(4, view.otherPrograms.size());
      Assert.areEqual(
        JSON.serialize(read.otherPrograms),
        JSON.serialize(view.otherPrograms)
      );
    }
  }
}
