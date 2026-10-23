/**
 * Putting a special day on a day (SpecialDayPlacing: asked first before replacing another), and
 * "Set it up" on a cell an import noted as not set up yet (SpecialSetUp: the event's cells point
 * at it; the special day goes on the weekdays the file had it). ADR 0014 slice 4. Taking a
 * special day off a day (slice 6): the day's regular schedule back as it was, the special day kept. As a scheduler,
 * with records made inside the same System.runAs; each request's queries are bounded.
 */
@IsTest
private class SpecialPlacingTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  private static final Date WEDNESDAY = Date.newInstance(2026, 7, 1);

  /** Put this special day on the week's weekday (asking before replacing another). */
  private static SpecialDayPlacing.Request request(
    Id specialDayId,
    Id weekId,
    String day
  ) {
    SpecialDayPlacing.Request asked = new SpecialDayPlacing.Request();
    asked.specialDayId = specialDayId;
    asked.weekId = weekId;
    asked.day = day;
    return asked;
  }

  /** The same, the answer to the question being yes. */
  private static SpecialDayPlacing.Request replacing(
    SpecialDayPlacing.Request asked
  ) {
    asked.answer = SpecialDayPlacing.REPLACE;
    return asked;
  }

  private static List<SpecialDate__c> daysOf(Id weekId) {
    return [
      SELECT Day__c, SpecialDay__r.Name, SpecialEvent__r.Name
      FROM SpecialDate__c
      WHERE Week__c = :weekId
      WITH USER_MODE
      ORDER BY Day__c, SpecialEvent__r.Name NULLS FIRST
    ];
  }

  @IsTest
  static void aSpecialDayGoesOnADayAndAsksBeforeReplacingAnother() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id visiting = SpecialScheduleTestData.addDay(
        ids.get('Season'),
        'Visiting Day'
      );
      Id week = ids.get('Week 1');

      Test.startTest();
      Integer before = Limits.getQueries();
      SpecialDayPlacing.Placed first = SpecialPlacingController.putOnDay(
        request(ids.get('Field Day'), week, 'Tuesday')
      );
      Integer used = Limits.getQueries() - before;
      SpecialDayPlacing.Placed asked = SpecialPlacingController.putOnDay(
        request(visiting, week, 'Tuesday')
      );
      List<SpecialDate__c> afterAsking = daysOf(week);
      SpecialDayPlacing.Placed replaced = SpecialPlacingController.putOnDay(
        replacing(request(visiting, week, 'Tuesday'))
      );
      SpecialDayPlacing.Placed again = SpecialPlacingController.putOnDay(
        request(visiting, week, 'Tuesday')
      );
      Test.stopTest();

      Assert.isTrue(
        used <= 20,
        'Queries to put a special day on a day: ' + used
      );
      Assert.areEqual('"Field Day" is on Tuesday of "Week 1".', first.said);
      Assert.areEqual(
        'Tuesday of "Week 1" already has the special day "Field Day". Use this one instead? "Field Day" stays saved.',
        asked.asks
      );
      Assert.areEqual('Field Day', asked.replaces);
      Assert.isNull(asked.said);
      Assert.areEqual(1, afterAsking.size(), 'Nothing changed by asking');
      Assert.areEqual('Field Day', afterAsking[0].SpecialDay__r.Name);
      Assert.areEqual(
        '"Visiting Day" is on Tuesday of "Week 1".',
        replaced.said
      );
      List<SpecialDate__c> now = daysOf(week);
      Assert.areEqual(1, now.size());
      Assert.areEqual('Visiting Day', now[0].SpecialDay__r.Name);
      // Field Day stays saved.
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM SpecialDay__c
          WHERE Name = 'Field Day'
          WITH USER_MODE
        ]
      );
      Assert.areEqual(
        '"Visiting Day" is already on Tuesday of "Week 1".',
        again.said
      );
    }
  }

  /** The text and revision of each day of a schedule, by date: what it holds, kept or not. */
  private static Map<Date, String> daysHeld(Id scheduleId) {
    Map<Date, String> held = new Map<Date, String>();
    for (ScheduleDays.DayGrid read : ScheduleDays.read(scheduleId)) {
      held.put(read.day, JSON.serialize(read.grid) + '@' + read.revision);
    }
    return held;
  }

  @IsTest
  static void takingASpecialDayOffGivesTheDayBackAsItWas() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id week = ids.get('Week 1');
      ManualBuildViews.DraftView started = ManualBuildController.startBlankWeek(
        ids.get('Main'),
        week
      );
      Id draftId = started.schedule.schedule.id;
      SpecialDates.place(ids.get('Field Day'), week, 'Tuesday');
      Map<Date, String> heldBefore = daysHeld(draftId);

      Test.startTest();
      Integer before = Limits.getQueries();
      SpecialDayPlacing.Placed off = SpecialPlacingController.takeOffDay(
        request(ids.get('Field Day'), week, 'Tuesday')
      );
      Integer used = Limits.getQueries() - before;
      SpecialDayPlacing.Placed again = SpecialPlacingController.takeOffDay(
        request(ids.get('Field Day'), week, 'Tuesday')
      );
      Test.stopTest();

      Assert.isTrue(used <= 10, 'Queries to take a special day off: ' + used);
      Assert.areEqual(
        'Tuesday of "Week 1" has its regular schedule again. "Field Day" stays saved.',
        off.said
      );
      Assert.areEqual(0, daysOf(week).size(), 'Off that day');
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM SpecialDay__c
          WHERE Id = :ids.get('Field Day')
          WITH USER_MODE
        ],
        'The special day stays saved'
      );
      Assert.isTrue(
        [
          SELECT COUNT()
          FROM PlanPart__c
          WHERE SpecialDay__c = :ids.get('Field Day')
          WITH USER_MODE
        ] > 0,
        'Its plan stays saved'
      );
      Assert.areEqual(
        heldBefore,
        daysHeld(draftId),
        'The week\'s own days are as they were, Tuesday too'
      );
      Assert.areEqual(
        0,
        WeekSpecials.read(
            [
              SELECT Id, StartDate__c, EndDate__c
              FROM Week__c
              WHERE Id = :week
              WITH USER_MODE
            ],
            new List<Group__c>()
          )
          .days.size(),
        'Nothing replaces Tuesday now'
      );
      Assert.areEqual('"Field Day" is not on Tuesday of "Week 1".', again.said);
    }
  }

  @IsTest
  static void takingOffLeavesAnotherSpecialDayWhereItIs() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id visiting = SpecialScheduleTestData.addDay(
        ids.get('Season'),
        'Visiting Day'
      );
      Id carnival = SpecialScheduleTestData.addEvent(
        ids.get('Season'),
        'Carnival'
      );
      Id week = ids.get('Week 1');
      SpecialDates.place(visiting, week, 'Tuesday');

      Test.startTest();
      SpecialDayPlacing.Placed off = SpecialPlacingController.takeOffDay(
        request(ids.get('Field Day'), week, 'Tuesday')
      );
      String refusal;
      try {
        SpecialPlacingController.takeOffDay(request(carnival, week, 'Tuesday'));
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Test.stopTest();

      Assert.areEqual('"Field Day" is not on Tuesday of "Week 1".', off.said);
      List<SpecialDate__c> now = daysOf(week);
      Assert.areEqual(1, now.size());
      Assert.areEqual('Visiting Day', now[0].SpecialDay__r.Name);
      Assert.areEqual('That can\'t be taken off a day.', refusal);
    }
  }

  @IsTest
  static void aWeekdayTheWeekDoesNotHaveIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Week__c shortWeek = new Week__c(
        Season__c = ids.get('Season'),
        Name = 'Short week',
        StartDate__c = Date.newInstance(2026, 8, 12),
        EndDate__c = Date.newInstance(2026, 8, 14),
        SortOrder__c = 9
      );
      Database.insert(shortWeek, AccessLevel.USER_MODE);

      Test.startTest();
      String refusal;
      try {
        SpecialPlacingController.putOnDay(
          request(ids.get('Field Day'), shortWeek.Id, 'Monday')
        );
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Test.stopTest();

      Assert.areEqual('"Short week" has no Monday.', refusal);
    }
  }

  /** The Manual Build draft of Week 1, with one cell of Monday holding what a file noted. */
  private static Id draftNoting(
    Map<String, Id> ids,
    ScheduleGrid.Item noted,
    Date day
  ) {
    ManualBuildViews.DraftView view = ManualBuildController.startBlankWeek(
      ids.get('Main'),
      ids.get('Week 1')
    );
    Id draftId = view.schedule.schedule.id;
    for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
      if (read.day == day) {
        read.grid.items.add(noted);
        read.grid.rows[0][0] = String.valueOf(read.grid.items.size());
        read.grid.rows[1][0] = String.valueOf(read.grid.items.size());
        ScheduleDaySaves.write(
          draftId,
          new List<ScheduleDaySaves.DaySave>{
            new ScheduleDaySaves.DaySave(read.day, read.grid, read.revision)
          }
        );
      }
    }
    return draftId;
  }

  @IsTest
  static void settingUpANotedEventMakesItAndPointsItsCellsAtIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id draftId = draftNoting(
        ids,
        new ScheduleGrid.Item('S', '', 'Color War'),
        MONDAY
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      SpecialSetUp.Done done = SpecialPlacingController.setUpItem(
        draftId,
        'S',
        'Color War'
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 30, 'Queries to set up an event: ' + used);
      Assert.areEqual('"Color War" is set up as a special event.', done.said);
      List<SpecialEvent__c> made = [
        SELECT Id, Name
        FROM SpecialEvent__c
        WHERE Season__c = :ids.get('Season')
        WITH USER_MODE
      ];
      Assert.areEqual(1, made.size());
      ScheduleGrid mondayGrid;
      for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
        if (read.day == MONDAY) {
          mondayGrid = read.grid;
        }
      }
      ScheduleGrid.Item item = mondayGrid.items[
        Integer.valueOf(mondayGrid.rows[0][0]) - 1
      ];
      Assert.areEqual('S', item.kind);
      Assert.areEqual(String.valueOf(made[0].Id), item.id);
      Assert.areEqual(mondayGrid.rows[0][0], mondayGrid.rows[1][0], 'One item');
      // And it is on Monday of Week 1, as the grid holds it.
      List<SpecialDate__c> days = daysOf(ids.get('Week 1'));
      Assert.areEqual(1, days.size());
      Assert.areEqual('Color War', days[0].SpecialEvent__r.Name);
      Assert.areEqual('Monday', days[0].Day__c);
    }
  }

  @IsTest
  static void settingUpANotedSpecialDayPutsItOnTheDaysTheFileHadIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id draftId = draftNoting(
        ids,
        new ScheduleGrid.Item('D', '', 'Visiting day '),
        WEDNESDAY
      );

      Test.startTest();
      SpecialSetUp.Done done = SpecialPlacingController.setUpItem(
        draftId,
        'D',
        'Visiting day '
      );
      Test.stopTest();

      Assert.areEqual(
        '"Visiting day" is set up as a special day, on Wednesday.',
        done.said
      );
      List<SpecialDate__c> days = daysOf(ids.get('Week 1'));
      Assert.areEqual(1, days.size());
      Assert.areEqual('Visiting day', days[0].SpecialDay__r.Name);
      Assert.areEqual('Wednesday', days[0].Day__c);
      // It starts from the camp's regular day, as one added on the Special events screen does.
      Id made = [
        SELECT Id
        FROM SpecialDay__c
        WHERE Name = 'Visiting day'
        WITH USER_MODE
      ]
      .Id;
      Assert.isNotNull(SpecialPlans.read(made).grid, 'It has a schedule');
    }
  }

  @IsTest
  static void settingUpADayAlreadyTakenLeavesTheOtherSpecialDay() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id draftId = draftNoting(
        ids,
        new ScheduleGrid.Item('D', '', 'Visiting Day'),
        WEDNESDAY
      );
      SpecialDates.place(ids.get('Field Day'), ids.get('Week 1'), 'Wednesday');

      Test.startTest();
      SpecialSetUp.Done done = SpecialPlacingController.setUpItem(
        draftId,
        'D',
        'Visiting Day'
      );
      Test.stopTest();

      Assert.areEqual(
        '"Visiting Day" is set up as a special day. Wednesday already has "Field Day", so it isn\'t on that day.',
        done.said
      );
      List<SpecialDate__c> days = daysOf(ids.get('Week 1'));
      Assert.areEqual(1, days.size());
      Assert.areEqual('Field Day', days[0].SpecialDay__r.Name);
    }
  }
}
