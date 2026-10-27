/**
 * Any day of the week (Greg, 2026-10-27): a program that runs Sunday to Thursday, or every day,
 * gets its blank week, its fixed and recurring activities, "Fill in weeks", and an import on
 * those days, weekends included. Synthetic camp only (SetTimeTestData, ImportTestPlans).
 */
@IsTest
private class WeekendDaysTest {
  private static final List<String> SUNDAY_TO_THURSDAY = new List<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Sunday'
  };
  private static final List<String> EVERY_DAY = new List<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  };

  /** Main runs on these days, and Week 2 is moved to these dates. Returns the camp's Ids. */
  private static Map<String, Id> campOn(
    List<String> days,
    Date weekStart,
    Date weekEnd
  ) {
    Map<String, Id> ids = SetTimeTestData.camp();
    Program__c main = new Program__c(Id = ids.get('Main'));
    for (String day : SetTimePlan.WEEKDAYS) {
      main.put(
        SetTimePlan.dayField(Program__c.SObjectType, day),
        days.contains(day)
      );
    }
    Database.update(main, AccessLevel.SYSTEM_MODE);
    Database.update(
      new Week__c(
        Id = ids.get('Week 2'),
        StartDate__c = weekStart,
        EndDate__c = weekEnd
      ),
      AccessLevel.SYSTEM_MODE
    );
    FixedActivity__c flagpole = SetTimeTestData.fixed(
      ids,
      'Flagpole',
      'Period 1'
    );
    Database.insert(flagpole, AccessLevel.SYSTEM_MODE);
    ids.put('Flagpole', flagpole.Id);
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
    return ids;
  }

  /** A recurring activity at lunch on one day, for everyone in Main. */
  private static Id recurringOn(Map<String, Id> ids, String day) {
    RecurringActivity__c rest = SetTimeTestData.recurring(ids, 'Rest', 'Lunch');
    rest.Monday__c = false;
    rest.put(SetTimePlan.dayField(RecurringActivity__c.SObjectType, day), true);
    Database.insert(rest, AccessLevel.SYSTEM_MODE);
    return rest.Id;
  }

  @IsTest
  static void aSundayToThursdayProgramsBlankWeekStartsOnSunday() {
    System.runAs(ShoreshTestData.scheduler()) {
      // Sunday 5 July to Thursday 9 July 2026.
      Date sunday = Date.newInstance(2026, 7, 5);
      Map<String, Id> ids = campOn(
        SUNDAY_TO_THURSDAY,
        sunday,
        sunday.addDays(4)
      );
      Id rest = recurringOn(ids, 'Sunday');
      Test.startTest();
      ManualBuildViews.DraftView view = ManualBuildController.startBlankWeek(
        ids.get('Main'),
        ids.get('Week 2')
      );
      Test.stopTest();
      Assert.areEqual(5, view.schedule.days.size());
      Assert.areEqual(sunday, view.schedule.days[0].dateValue);
      Assert.areEqual(sunday.addDays(4), view.schedule.days[4].dateValue);
      String flagpole = 'F:' + ids.get('Flagpole');
      // Each group (Period 1, Period 2, Lunch): Flagpole every day; Rest at Sunday's lunch only.
      for (Integer g = 0; g < 3; g++) {
        Assert.areEqual(
          new List<String>{ flagpole, '', 'R:' + rest },
          SlotRunsTestData.slots(view.schedule.days[0], g)
        );
        Assert.areEqual(
          new List<String>{ flagpole, '', '' },
          SlotRunsTestData.slots(view.schedule.days[1], g)
        );
      }
    }
  }

  @IsTest
  static void aProgramThatRunsEveryDayHasSevenDaysAndItsSaturdayItems() {
    System.runAs(ShoreshTestData.scheduler()) {
      // Saturday 4 July to Friday 10 July 2026.
      Date saturday = Date.newInstance(2026, 7, 4);
      Map<String, Id> ids = campOn(EVERY_DAY, saturday, saturday.addDays(6));
      Id rest = recurringOn(ids, 'Saturday');
      Test.startTest();
      ManualBuildViews.DraftView view = ManualBuildController.startBlankWeek(
        ids.get('Main'),
        ids.get('Week 2')
      );
      Test.stopTest();
      Assert.areEqual(7, view.schedule.days.size());
      Assert.areEqual(saturday, view.schedule.days[0].dateValue);
      String flagpole = 'F:' + ids.get('Flagpole');
      // Rest at Saturday's lunch; Sunday has Flagpole and no Rest.
      Assert.areEqual(
        new List<String>{ flagpole, '', 'R:' + rest },
        SlotRunsTestData.slots(view.schedule.days[0], 0)
      );
      Assert.areEqual(
        new List<String>{ flagpole, '', '' },
        SlotRunsTestData.slots(view.schedule.days[1], 0)
      );
    }
  }

  @IsTest
  static void aRecurringActivityOnSundayRunsWhenItsProgramRunsSunday() {
    System.runAs(ShoreshTestData.scheduler()) {
      Date sunday = Date.newInstance(2026, 7, 5);
      Map<String, Id> ids = campOn(
        SUNDAY_TO_THURSDAY,
        sunday,
        sunday.addDays(4)
      );
      recurringOn(ids, 'Sunday');
      Test.startTest();
      SetTimePlan plan = SetTimePlanReader.read(
          new Set<Id>{ ids.get('Season') }
        )
        .get(ids.get('Season'));
      Test.stopTest();
      SetTimePlan.Item rest;
      for (SetTimePlan.Item item : plan.items) {
        if (item.name == 'Rest') {
          rest = item;
        }
      }
      Assert.isNotNull(rest);
      Assert.areEqual(new List<String>{ 'Sunday' }, rest.runDays());
      Assert.isTrue(rest.program.days.contains('Sunday'));
      Assert.isFalse(rest.program.days.contains('Friday'));
    }
  }

  private static Season__c season(Date startDate, Date endDate) {
    Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
    Season__c season = new Season__c(
      Name = 'Summer 2026',
      Camp__c = camp.Id,
      StartDate__c = startDate,
      EndDate__c = endDate,
      Status__c = 'Active'
    );
    Database.insert(season, AccessLevel.SYSTEM_MODE);
    return season;
  }

  private static void programOn(Id seasonId, List<String> days) {
    Program__c program = new Program__c(
      Season__c = seasonId,
      Name = 'Main',
      SortOrder__c = 1
    );
    for (String day : SetTimePlan.WEEKDAYS) {
      program.put(
        SetTimePlan.dayField(Program__c.SObjectType, day),
        days.contains(day)
      );
    }
    Database.insert(program, AccessLevel.SYSTEM_MODE);
  }

  private static List<Week__c> weeksOf(Id seasonId) {
    return [
      SELECT Name, StartDate__c, EndDate__c
      FROM Week__c
      WHERE Season__c = :seasonId
      ORDER BY StartDate__c
    ];
  }

  @IsTest
  static void fillInWeeksFollowsASundayToThursdayProgram() {
    System.runAs(ShoreshTestData.scheduler()) {
      // Sunday 28 June to Thursday 9 July 2026.
      Season__c s = season(
        Date.newInstance(2026, 6, 28),
        Date.newInstance(2026, 7, 9)
      );
      programOn(s.Id, SUNDAY_TO_THURSDAY);
      Test.startTest();
      SeasonSetupController.addWeeksFromSeasonDates(s.Id);
      Test.stopTest();
      List<Week__c> weeks = weeksOf(s.Id);
      Assert.areEqual(2, weeks.size());
      Assert.areEqual(Date.newInstance(2026, 6, 28), weeks[0].StartDate__c);
      Assert.areEqual(Date.newInstance(2026, 7, 2), weeks[0].EndDate__c);
      Assert.areEqual(Date.newInstance(2026, 7, 5), weeks[1].StartDate__c);
      Assert.areEqual(Date.newInstance(2026, 7, 9), weeks[1].EndDate__c);
    }
  }

  @IsTest
  static void fillInWeeksGivesASevenDayProgramSevenDayWeeks() {
    System.runAs(ShoreshTestData.scheduler()) {
      // Saturday 27 June to Friday 10 July 2026.
      Season__c s = season(
        Date.newInstance(2026, 6, 27),
        Date.newInstance(2026, 7, 10)
      );
      programOn(s.Id, EVERY_DAY);
      Test.startTest();
      SeasonSetupController.addWeeksFromSeasonDates(s.Id);
      Test.stopTest();
      List<Week__c> weeks = weeksOf(s.Id);
      Assert.areEqual(2, weeks.size());
      Assert.areEqual(Date.newInstance(2026, 6, 27), weeks[0].StartDate__c);
      Assert.areEqual(Date.newInstance(2026, 7, 3), weeks[0].EndDate__c);
      Assert.areEqual(Date.newInstance(2026, 7, 10), weeks[1].EndDate__c);
    }
  }

  /** Import last year into an empty season, its grid running on these days from its first day. */
  private static Map<String, Object> importOn(
    Season__c s,
    List<String> days,
    Integer weekCount
  ) {
    Map<String, Object> plan = ImportTestPlans.newCamp(s.Id);
    Map<String, Object> program = (Map<String, Object>) ((List<Object>) plan.get(
      'programs'
    ))[0];
    program.put('days', days);
    Map<String, Object> recurring = (Map<String, Object>) ((List<Object>) plan.get(
      'recurringActivities'
    ))[0];
    recurring.put('days', new List<Object>{ 'Sunday' });
    List<Object> fill = new List<Object>();
    for (Integer i = 0; i < weekCount; i++) {
      fill.add(
        new Map<String, Object>{
          'start' => String.valueOf(s.StartDate__c.addDays(7 * i)),
          'name' => 'Week ' + (i + 1),
          'days' => String.join(days, '+')
        }
      );
    }
    plan.put('fillWeeks', fill);
    // Last year's first day, a weekend day, kept in the first week.
    ImportTestPlans.addVersion(
      plan,
      new Week__c(StartDate__c = s.StartDate__c)
    );
    Map<String, Object> version = (Map<String, Object>) ((List<Object>) plan.get(
      'versions'
    ))[0];
    version.remove('weekId');
    version.put('weekKey', 'Week:' + String.valueOf(s.StartDate__c));
    return plan;
  }

  @IsTest
  static void importingASundayToThursdayGridAddsSundayWeeksAndKeepsSunday() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c s = season(
        Date.newInstance(2026, 6, 28),
        Date.newInstance(2026, 7, 9)
      );
      Test.startTest();
      ImportController.saveSetup(
        JSON.serialize(importOn(s, SUNDAY_TO_THURSDAY, 2))
      );
      Test.stopTest();
      List<Week__c> weeks = weeksOf(s.Id);
      Assert.areEqual(2, weeks.size());
      Assert.areEqual(Date.newInstance(2026, 6, 28), weeks[0].StartDate__c);
      Assert.areEqual(Date.newInstance(2026, 7, 2), weeks[0].EndDate__c);
      Program__c main = [
        SELECT Sunday__c, Friday__c, Saturday__c
        FROM Program__c
        WHERE Season__c = :s.Id
      ];
      Assert.isTrue(main.Sunday__c);
      Assert.isFalse(main.Friday__c);
      Assert.isFalse(main.Saturday__c);
      Assert.isTrue(
        [SELECT Sunday__c FROM RecurringActivity__c WHERE Name = 'Library']
        .Sunday__c
      );
      Assert.areEqual(
        Date.newInstance(2026, 6, 28),
        [
          SELECT Date__c
          FROM ScheduleDay__c
          WHERE Schedule__r.Program__r.Season__c = :s.Id
        ]
        .Date__c
      );
    }
  }

  @IsTest
  static void importingASevenDayGridAddsSevenDayWeeks() {
    System.runAs(ShoreshTestData.scheduler()) {
      // Saturday 27 June to Friday 10 July 2026.
      Season__c s = season(
        Date.newInstance(2026, 6, 27),
        Date.newInstance(2026, 7, 10)
      );
      Test.startTest();
      ImportController.saveSetup(JSON.serialize(importOn(s, EVERY_DAY, 2)));
      Test.stopTest();
      List<Week__c> weeks = weeksOf(s.Id);
      Assert.areEqual(2, weeks.size());
      Assert.areEqual(Date.newInstance(2026, 6, 27), weeks[0].StartDate__c);
      Assert.areEqual(Date.newInstance(2026, 7, 3), weeks[0].EndDate__c);
      Program__c main = [
        SELECT Saturday__c, Sunday__c
        FROM Program__c
        WHERE Season__c = :s.Id
      ];
      Assert.isTrue(main.Saturday__c && main.Sunday__c);
    }
  }
}
