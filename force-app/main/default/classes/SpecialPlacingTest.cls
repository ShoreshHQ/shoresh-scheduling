/**
 * Putting a special day on a day (SpecialDayPlacing: asked first before replacing another), and
 * "Set it up" on a cell an import noted as not set up yet (SpecialSetUp: the event's cells point
 * at it; the special day goes on the weekdays the file had it). ADR 0014 slice 4. As a scheduler,
 * with records made inside the same System.runAs; each request's queries are bounded.
 */
@IsTest
private class SpecialPlacingTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  private static final Date WEDNESDAY = Date.newInstance(2026, 7, 1);

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
        ids.get('Field Day'),
        week,
        'Tuesday',
        false
      );
      Integer used = Limits.getQueries() - before;
      SpecialDayPlacing.Placed asked = SpecialPlacingController.putOnDay(
        visiting,
        week,
        'Tuesday',
        false
      );
      List<SpecialDate__c> afterAsking = daysOf(week);
      SpecialDayPlacing.Placed replaced = SpecialPlacingController.putOnDay(
        visiting,
        week,
        'Tuesday',
        true
      );
      SpecialDayPlacing.Placed again = SpecialPlacingController.putOnDay(
        visiting,
        week,
        'Tuesday',
        false
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
          ids.get('Field Day'),
          shortWeek.Id,
          'Monday',
          false
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
    String kind,
    String name,
    Date day
  ) {
    ManualBuildViews.DraftView view = ManualBuildController.startBlankWeek(
      ids.get('Main'),
      ids.get('Week 1')
    );
    Id draftId = view.schedule.schedule.id;
    for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
      if (read.day == day) {
        read.grid.items.add(new ScheduleGrid.Item(kind, '', name));
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
      Id draftId = draftNoting(ids, 'S', 'Color War', MONDAY);

      Test.startTest();
      Integer before = Limits.getQueries();
      SpecialSetUp.Done done = ManualBuildController.setUpItem(
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
      Id draftId = draftNoting(ids, 'D', 'Visiting day ', WEDNESDAY);

      Test.startTest();
      SpecialSetUp.Done done = ManualBuildController.setUpItem(
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
      Id draftId = draftNoting(ids, 'D', 'Visiting Day', WEDNESDAY);
      SpecialDates.place(ids.get('Field Day'), ids.get('Week 1'), 'Wednesday');

      Test.startTest();
      SpecialSetUp.Done done = ManualBuildController.setUpItem(
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
