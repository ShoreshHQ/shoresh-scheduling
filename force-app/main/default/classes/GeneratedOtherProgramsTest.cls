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
    ScheduleGrid grid = teensGrid(ids);
    grid.items.add(item(ids, 'A', 'Swim'));
    grid.rows[0][0] = '1';
    return teensDay(ids, status, day, grid);
  }

  /** Teens' day frame: its three time blocks, Teen 1 and Teen 2, nothing placed. */
  private static ScheduleGrid teensGrid(Map<String, Id> ids) {
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
    grid.rows.add(new List<String>{ '', '', '' });
    grid.rows.add(new List<String>{ '', '', '' });
    return grid;
  }

  private static ScheduleGrid.Item item(
    Map<String, Id> ids,
    String kind,
    String name
  ) {
    return new ScheduleGrid.Item(kind, ids.get(name), name);
  }

  /** A Teens schedule of Week 1 (Published, Draft or Version) with one day. */
  private static Id teensDay(
    Map<String, Id> ids,
    String status,
    Date day,
    ScheduleGrid grid
  ) {
    Schedule__c schedule = new Schedule__c(
      Program__c = ids.get('Teens'),
      Week__c = ids.get('Week 1'),
      Name = 'Teens ' + status,
      Status__c = status,
      Origin__c = 'Manual',
      VersionReason__c = status == 'Version' ? 'Imported' : null
    );
    Database.insert(schedule, AccessLevel.SYSTEM_MODE);
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
    // Sorted as text (places by name): Ids don't come in a fixed order.
    lines.sort();
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

  @IsTest
  static void onlyTheNewestPublishedScheduleCountsNeverAVersion() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithTeens();
      checked();
      // An older published Monday (Teen 1 swims), the newest (Teen 2 plays Soccer), and a saved
      // version (Teen 1 at Gym games).
      Id older = teensSchedule(ids, 'Published', MONDAY);
      Test.setCreatedDate(older, Datetime.now().addDays(-2));
      ScheduleGrid newest = teensGrid(ids);
      newest.items.add(item(ids, 'A', 'Soccer'));
      newest.rows[1][0] = '1';
      teensDay(ids, 'Published', MONDAY, newest);
      ScheduleGrid version = teensGrid(ids);
      version.items.add(item(ids, 'A', 'Gym games'));
      version.rows[0][0] = '1';
      teensDay(ids, 'Version', MONDAY, version);
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();
      Assert.areEqual(
        new List<String>{ '2026-06-29 10:30-11:15 Field A Soccer x1' },
        described(read.otherPrograms, ids)
      );
    }
  }

  @IsTest
  static void publishedCellsCarryOnAndFixedAndRecurringCountAtTheirPlace() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithTeens();
      // Morning dip (fixed) at the Gym in Swim hour; Canoe (recurring, Mondays) on Field A in
      // Rest hour.
      FixedActivity__c dip = new FixedActivity__c(
        Program__c = ids.get('Teens'),
        Name = 'Morning dip',
        TimeBlock__c = ids.get('Swim hour'),
        Length__c = 1,
        Location__c = ids.get('Gym')
      );
      RecurringActivity__c canoe = new RecurringActivity__c(
        Program__c = ids.get('Teens'),
        Name = 'Canoe',
        TimeBlock__c = ids.get('Rest hour'),
        Length__c = 1,
        Location__c = ids.get('Field A'),
        Monday__c = true
      );
      insertAll(new List<SObject>{ dip, canoe });
      checked();
      ids.put('Morning dip', dip.Id);
      ids.put('Canoe', canoe.Id);
      // Published Monday as a director might have changed it: Teen 1 swims two blocks, then
      // Canoe; Teen 2 has Morning dip.
      ScheduleGrid grid = teensGrid(ids);
      grid.items.add(item(ids, 'A', 'Swim'));
      grid.items.add(item(ids, 'R', 'Canoe'));
      grid.items.add(item(ids, 'F', 'Morning dip'));
      grid.rows[0] = new List<String>{ '1', '^', '2' };
      grid.rows[1] = new List<String>{ '3', '', '' };
      teensDay(ids, 'Published', MONDAY, grid);
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();
      // From Tuesday, Morning dip counts from setup for both Teens.
      Assert.areEqual(
        new List<String>{
          '2026-06-29 10:30-11:15 Gym - x1',
          '2026-06-29 10:30-11:15 Pool Swim x1',
          '2026-06-29 13:00-13:45 Pool Swim x1',
          '2026-06-29 14:00-14:45 Field A - x1',
          '2026-06-30 10:30-11:15 Gym - x2',
          '2026-07-01 10:30-11:15 Gym - x2',
          '2026-07-02 10:30-11:15 Gym - x2'
        },
        described(read.otherPrograms, ids)
      );
    }
  }

  @IsTest
  static void publishedCellsSkipAGroupAwayAPlaceClosedAndAnActivityOff() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithTeens();
      RecurringActivity__c canoe = new RecurringActivity__c(
        Program__c = ids.get('Teens'),
        Name = 'Canoe',
        TimeBlock__c = ids.get('Afternoon'),
        Length__c = 1,
        Location__c = ids.get('Gym'),
        Monday__c = true
      );
      insertAll(new List<SObject>{ canoe });
      ids.put('Canoe', canoe.Id);
      // Week 1: Teen 2 away, Field A closed, Canoe off.
      Id week = ids.get('Week 1');
      Database.insert(
        new List<WeekException__c>{
          new WeekException__c(Week__c = week, Group__c = ids.get('Teen 2')),
          new WeekException__c(
            Week__c = week,
            Location__c = ids.get('Field A')
          ),
          new WeekException__c(Week__c = week, RecurringActivity__c = canoe.Id)
        },
        AccessLevel.SYSTEM_MODE
      );
      checked();
      ScheduleGrid grid = teensGrid(ids);
      grid.items.add(item(ids, 'A', 'Soccer'));
      grid.items.add(item(ids, 'R', 'Canoe'));
      grid.items.add(item(ids, 'A', 'Swim'));
      grid.rows[0] = new List<String>{ '1', '2', '' };
      grid.rows[1] = new List<String>{ '3', '', '' };
      teensDay(ids, 'Published', MONDAY, grid);
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();
      // Soccer still counts as Soccer, but not on Field A; Canoe and Teen 2's Swim don't count.
      Assert.areEqual(
        new List<String>{ '2026-06-29 10:30-11:15 - Soccer x1' },
        described(read.otherPrograms, ids)
      );
    }
  }

  @IsTest
  static void recurringActivitiesCoverWhoTheyNameAndOnlyGroupsAtCamp() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithTeens();
      // Teen 2 comes mornings only.
      Database.update(
        new Group__c(Id = ids.get('Teen 2'), Availability__c = 'MorningOnly'),
        AccessLevel.SYSTEM_MODE
      );
      // Choir (Tuesdays, Afternoon, the Gym) names nobody: every Teen at camp then. Hike
      // (Wednesdays, Swim hour, Field A) names the Teen groups division.
      RecurringActivity__c choir = new RecurringActivity__c(
        Program__c = ids.get('Teens'),
        Name = 'Choir',
        TimeBlock__c = ids.get('Afternoon'),
        Length__c = 1,
        Location__c = ids.get('Gym'),
        Monday__c = false,
        Tuesday__c = true
      );
      RecurringActivity__c hike = new RecurringActivity__c(
        Program__c = ids.get('Teens'),
        Name = 'Hike',
        TimeBlock__c = ids.get('Swim hour'),
        Length__c = 1,
        Location__c = ids.get('Field A'),
        Monday__c = false,
        Wednesday__c = true
      );
      insertAll(new List<SObject>{ choir, hike });
      Database.insert(
        new Coverage__c(
          RecurringActivity__c = hike.Id,
          Division__c = ids.get('Teen groups'),
          Season__c = ids.get('Season')
        ),
        AccessLevel.SYSTEM_MODE
      );
      checked();
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();
      Assert.areEqual(
        new List<String>{
          '2026-06-30 13:00-13:45 Gym - x1',
          '2026-07-01 10:30-11:15 Field A - x2'
        },
        described(read.otherPrograms, ids)
      );
    }
  }

  @IsTest
  static void aPublishedDayThatCantBeReadFallsBackToSetup() {
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
      Schedule__c published = new Schedule__c(
        Program__c = ids.get('Teens'),
        Week__c = ids.get('Week 1'),
        Name = 'Teens Published',
        Status__c = 'Published',
        Origin__c = 'Manual'
      );
      Database.insert(published, AccessLevel.SYSTEM_MODE);
      Database.insert(
        new ScheduleDay__c(
          Schedule__c = published.Id,
          Date__c = MONDAY,
          Part__c = 1,
          Revision__c = 1,
          GridFormatVersion__c = ScheduleGrid.FORMAT_VERSION,
          Grid__c = 'not a grid'
        ),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();
      Assert.areEqual(
        new List<String>{
          '2026-06-29 14:00-14:45 Gym - x2',
          '2026-06-30 14:00-14:45 Gym - x2',
          '2026-07-01 14:00-14:45 Gym - x2',
          '2026-07-02 14:00-14:45 Gym - x2'
        },
        described(read.otherPrograms, ids)
      );
    }
  }
}
