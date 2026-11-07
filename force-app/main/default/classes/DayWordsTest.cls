@IsTest
private class DayWordsTest {
  // 28 June 2027 is a Monday.
  private static final Date MONDAY = Date.newInstance(2027, 6, 28);
  // The season starts Monday 29 June 2026, its programs running from Monday.
  private static final Date CAMP_MONDAY = Date.newInstance(2026, 6, 29);

  private static Season__c seasonOn(Boolean numbered, Date start) {
    Season__c made = new Season__c(
      Name = 'Summer',
      Camp__c = ShoreshTestData.camp('Camp Willow').Id,
      StartDate__c = start,
      EndDate__c = start.addDays(60),
      NumberedDays__c = numbered
    );
    Database.insert(made, AccessLevel.SYSTEM_MODE);
    return made;
  }

  private static void runsOn(Id seasonId, List<String> days) {
    Program__c made = new Program__c(Name = 'Main', Season__c = seasonId);
    for (String day : SetTimePlan.WEEKDAYS) {
      made.put(
        SetTimePlan.dayField(Program__c.SObjectType, day),
        days.contains(day)
      );
    }
    Database.insert(made, AccessLevel.SYSTEM_MODE);
  }

  // WEEK-1.5
  @IsTest
  static void numbersComeFromThePlaceInTheWeek() {
    Assert.areEqual('Day 1', DayWords.dayNumbered(0, 0));
    Assert.areEqual('Day 3', DayWords.dayNumbered(2, 0));
    // Sunday to Thursday: Sunday is Day 1, Monday Day 2.
    Assert.areEqual('Day 1', DayWords.dayNumbered(6, 6));
    Assert.areEqual('Day 2', DayWords.dayNumbered(0, 6));
    // A six-day week reaches Day 6.
    Assert.areEqual('Day 6', DayWords.dayNumbered(5, 0));
  }

  // WEEK-1.5
  @IsTest
  static void aNumberedSeasonCountsFromTheCampsFirstDayRestartingEveryWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = seasonOn(true, MONDAY);
      runsOn(
        season.Id,
        new List<String>{
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday'
        }
      );
      DayWords.use(season.Id);
      Assert.areEqual('Day 2', DayWords.say(MONDAY));
      Assert.areEqual('Day 2', DayWords.say(MONDAY.addDays(7)));
      Assert.areEqual('Day 1', DayWords.say(MONDAY.addDays(6)));
      Assert.areEqual('Day 3', DayWords.sayWeekday('Tuesday'));
      Assert.areEqual('Not a day', DayWords.sayWeekday('Not a day'));
    }
  }

  // WEEK-1.5: a short week starting Wednesday starts on Day 3, by its date.
  @IsTest
  static void aShortWeekIsNumberedByItsDates() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = seasonOn(true, MONDAY.addDays(2));
      runsOn(
        season.Id,
        new List<String>{
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday'
        }
      );
      DayWords.use(season.Id);
      Assert.areEqual('Day 3', DayWords.say(MONDAY.addDays(2)));
    }
  }

  // WEEK-1.7: the main thing to guard.
  @IsTest
  static void aNamedSeasonSaysTheWeekday() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = seasonOn(false, MONDAY);
      DayWords.use(season.Id);
      Assert.areEqual('Monday', DayWords.say(MONDAY));
      Assert.areEqual('Tuesday', DayWords.sayWeekday('Tuesday'));
      Assert.areEqual(false, DayWords.namingOf(season.Id).get('numbered'));
    }
  }

  // WEEK-1.7
  @IsTest
  static void aScreensModuleIsToldTheNaming() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Object> naming = DayWords.namingOf(seasonOn(true, MONDAY).Id);
      Assert.areEqual(true, naming.get('numbered'));
      Assert.areEqual(1, naming.get('firstDay'));
    }
  }

  /** A numbered camp: its season, program, a week and a saved schedule. */
  private static Map<String, Id> numberedCamp() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer');
    season.NumberedDays__c = true;
    Database.update(season, AccessLevel.SYSTEM_MODE);
    Program__c program = ShoreshTestData.program(season.Id, 'Main');
    Week__c week = ShoreshTestData.weeks(season.Id, 1)[0];
    Id scheduleId = ShoreshTestData.savedVersion(program.Id, week.Id, 'Kept')
      .Id;
    return new Map<String, Id>{
      'Season' => season.Id,
      'Program' => program.Id,
      'Week' => week.Id,
      'Schedule' => scheduleId
    };
  }

  // WEEK-1.7
  @IsTest
  static void readingAScheduleNamesItsSeason() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = numberedCamp();
      DayWords.forgetSeasons();
      ScheduleDays.read(ids.get('Schedule'));
      Assert.areEqual('Day 2', DayWords.say(CAMP_MONDAY.addDays(1)));
    }
  }

  // WEEK-1.7
  @IsTest
  static void anAiMayNameTheNumberTheDateOrTheWeekdayOfACell() {
    System.runAs(ShoreshTestData.scheduler()) {
      DayWords.use(numberedCamp().get('Season'));
      ScheduleDays.DayGrid tuesday = new ScheduleDays.DayGrid();
      tuesday.day = CAMP_MONDAY.addDays(1);
      tuesday.grid = new ScheduleGrid();
      List<ScheduleDays.DayGrid> days = new List<ScheduleDays.DayGrid>{
        tuesday
      };
      for (
        String asked : new List<String>{
          'Day 2',
          'day 2',
          'Tuesday',
          '2026-06-30'
        }
      ) {
        Assert.areEqual(
          tuesday,
          AgentWeeks.dayOf(days, asked, 'Week 1'),
          asked
        );
      }
      try {
        AgentWeeks.dayOf(days, 'Day 3', 'Week 1');
        Assert.fail('That week has no Day 3 here');
      } catch (ShoreshException e) {
        Assert.isTrue(e.getMessage().contains('has no day "Day 3"'));
      }
    }
  }

  // WEEK-1.7
  @IsTest
  static void anAiMayNameASpecialDaysDayByItsNumber() {
    System.runAs(ShoreshTestData.scheduler()) {
      DayWords.use(numberedCamp().get('Season'));
      Assert.areEqual('Tuesday', AgentSpecialDay.weekdayOf('Day 2'));
      Assert.areEqual('Tuesday', AgentSpecialDay.weekdayOf('tuesday'));
    }
  }

  // WEEK-1.7
  @IsTest
  static void anAiMayNameAnElectiveTimeByItsNumberAndItIsSaidSo() {
    System.runAs(ShoreshTestData.scheduler()) {
      DayWords.use(numberedCamp().get('Season'));
      ElectivePeriod period = new ElectivePeriod();
      period.day = CAMP_MONDAY.addDays(1);
      period.blockName = 'Period 3';
      ElectiveSeats.RunView view = new ElectiveSeats.RunView();
      view.times = new List<ElectivePeriod>{ period };
      Assert.areEqual(
        period,
        AgentMoveElectiveSeat.timeOf(view, 'Day 2', 'Period 3')
      );
      Assert.areEqual(
        period,
        AgentMoveElectiveSeat.timeOf(view, 'Tuesday', 'Period 3')
      );
      Assert.areEqual('Day 2, Period 3', period.words());
    }
  }

  // WEEK-1.7
  @IsTest
  static void aSeatThatNoLongerFitsSaysItsDayByNumber() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      AgentElectivesTestData.assigned();
      Database.update(
        new Season__c(
          Id = AgentElectivesTestData.ids.get('Season'),
          NumberedDays__c = true
        ),
        AccessLevel.SYSTEM_MODE
      );
      DayWords.forgetSeasons();
      Assignment__c seat = AgentElectivesTestData.seats()[0];
      seat.Date__c = AgentElectivesTestData.MONDAY;
      String words = ElectiveFinalize.notFitting(
        new ElectiveRunState(AgentElectivesTestData.runId),
        seat,
        null
      );
      Assert.isTrue(words.contains('(Day '), words);
      Assert.isFalse(words.contains('Monday'), words);
    }
  }

  // WEEK-1.7
  @IsTest
  static void anActivitysEarlyDayIsReadAndChangedByItsNumber() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id seasonId = numberedCamp().get('Season');
      Activity__c swim = ShoreshTestData.activity(seasonId, 'Swim', null);
      swim.EarlyWeekCount__c = 1;
      swim.EarlyWeekByDay__c = 'Wednesday';
      Database.insert(swim, AccessLevel.SYSTEM_MODE);
      DayWords.forgetSeasons();
      Assert.areEqual(
        'Day 3',
        AgentActivityRules.now(swim.Id).get('early_week_by_day')
      );
      Assert.areEqual(
        'Wednesday',
        AgentActivityRules.asStored('early_week_by_day', 'Day 3')
      );
      Assert.areEqual(
        'Day 3',
        AgentActivityRules.asShown('early_week_by_day', 'Wednesday')
      );
      Assert.areEqual(
        'Day 3',
        AgentActivityRules.asShown('early_week_by_day', 'Day 3')
      );
      Assert.areEqual(
        '(blank)',
        AgentActivityRules.asShown('early_week_by_day', '(blank)')
      );
    }
  }

  // What a named season costs: its flag once, and it never reads programs.
  @IsTest
  static void aNamedSeasonCostsOneQueryAtMost() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c named = seasonOn(false, MONDAY);
      DayWords.forgetSeasons();
      DayWords.use(named.Id);
      Integer before = Limits.getQueries();
      DayWords.say(MONDAY);
      DayWords.sayWeekday('Tuesday');
      Assert.areEqual(1, Limits.getQueries() - before);

      DayWords.forgetSeasons();
      DayWords.use(new Season__c(Id = named.Id, NumberedDays__c = false));
      before = Limits.getQueries();
      DayWords.say(MONDAY);
      Assert.areEqual(0, Limits.getQueries() - before);
    }
  }

  // WEEK-1.7
  @IsTest
  static void withNoSeasonADayIsItsWeekday() {
    DayWords.forgetSeasons();
    Assert.areEqual('Monday', DayWords.say(MONDAY));
  }
}
