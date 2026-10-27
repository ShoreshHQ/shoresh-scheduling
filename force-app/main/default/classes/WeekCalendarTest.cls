@IsTest
private class WeekCalendarTest {
  private static final Set<String> SUNDAY_TO_THURSDAY = new Set<String>{
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday'
  };

  @IsTest
  static void weekdayNamesDoNotDependOnLocale() {
    Assert.areEqual(
      'Monday',
      WeekCalendar.weekdayName(Date.newInstance(2026, 6, 29))
    );
    Assert.areEqual(
      'Saturday',
      WeekCalendar.weekdayName(Date.newInstance(2026, 7, 4))
    );
    Assert.areEqual(
      'Sunday',
      WeekCalendar.weekdayName(Date.newInstance(2026, 7, 5))
    );
  }

  @IsTest
  static void aMondayToFridayCampsFullWeeksRunMondayToFriday() {
    List<WeekCalendar.DateRange> weeks = WeekCalendar.weeksOf(
      Date.newInstance(2026, 6, 29),
      Date.newInstance(2026, 8, 7),
      WeekCalendar.mondayToFriday()
    );
    Assert.areEqual(6, weeks.size());
    Assert.areEqual(Date.newInstance(2026, 6, 29), weeks[0].startDate);
    Assert.areEqual(Date.newInstance(2026, 7, 3), weeks[0].endDate);
    Assert.areEqual(Date.newInstance(2026, 8, 3), weeks[5].startDate);
    Assert.areEqual(Date.newInstance(2026, 8, 7), weeks[5].endDate);
  }

  @IsTest
  static void shortFirstAndLastWeeksAreKept() {
    // Wednesday 1 July to Tuesday 14 July.
    List<WeekCalendar.DateRange> weeks = WeekCalendar.weeksOf(
      Date.newInstance(2026, 7, 1),
      Date.newInstance(2026, 7, 14),
      WeekCalendar.mondayToFriday()
    );
    Assert.areEqual(3, weeks.size());
    Assert.areEqual(Date.newInstance(2026, 7, 1), weeks[0].startDate);
    Assert.areEqual(Date.newInstance(2026, 7, 3), weeks[0].endDate);
    Assert.areEqual(Date.newInstance(2026, 7, 13), weeks[2].startDate);
    Assert.areEqual(Date.newInstance(2026, 7, 14), weeks[2].endDate);
  }

  @IsTest
  static void aWeekendStartBeginsOnMonday() {
    List<WeekCalendar.DateRange> weeks = WeekCalendar.weeksOf(
      Date.newInstance(2026, 6, 27),
      Date.newInstance(2026, 7, 5),
      WeekCalendar.mondayToFriday()
    );
    Assert.areEqual(1, weeks.size());
    Assert.areEqual(Date.newInstance(2026, 6, 29), weeks[0].startDate);
    Assert.areEqual(Date.newInstance(2026, 7, 3), weeks[0].endDate);
  }

  @IsTest
  static void aWeekendOnlyRangeHasNoWeeks() {
    Assert.areEqual(
      0,
      WeekCalendar.weeksOf(
          Date.newInstance(2026, 7, 4),
          Date.newInstance(2026, 7, 5),
          WeekCalendar.mondayToFriday()
        )
        .size()
    );
  }

  @IsTest
  static void aWeekStartsAfterTheDaysOff() {
    Assert.areEqual(6, WeekCalendar.firstDayOf(SUNDAY_TO_THURSDAY, 0));
    Assert.areEqual(
      0,
      WeekCalendar.firstDayOf(WeekCalendar.mondayToFriday(), 3)
    );
    Assert.areEqual(
      5,
      WeekCalendar.firstDayOf(new Set<String>{ 'Saturday', 'Sunday' }, 0)
    );
    // Every day: the day given (the season's first).
    Set<String> everyDay = WeekCalendar.mondayToFriday();
    everyDay.addAll(new Set<String>{ 'Saturday', 'Sunday' });
    Assert.areEqual(3, WeekCalendar.firstDayOf(everyDay, 3));
  }

  @IsTest
  static void aSundayToThursdayCampGetsSundayToThursdayWeeks() {
    // Sunday 28 June to Thursday 9 July 2026.
    List<WeekCalendar.DateRange> weeks = WeekCalendar.weeksOf(
      Date.newInstance(2026, 6, 28),
      Date.newInstance(2026, 7, 9),
      SUNDAY_TO_THURSDAY
    );
    Assert.areEqual(2, weeks.size());
    Assert.areEqual(Date.newInstance(2026, 6, 28), weeks[0].startDate);
    Assert.areEqual(Date.newInstance(2026, 7, 2), weeks[0].endDate);
    Assert.areEqual(Date.newInstance(2026, 7, 5), weeks[1].startDate);
    Assert.areEqual(Date.newInstance(2026, 7, 9), weeks[1].endDate);
  }

  @IsTest
  static void aCampThatRunsEveryDayGetsSevenDayWeeksFromItsFirstDay() {
    Set<String> everyDay = WeekCalendar.mondayToFriday();
    everyDay.addAll(new Set<String>{ 'Saturday', 'Sunday' });
    // Saturday 27 June to Wednesday 8 July 2026.
    List<WeekCalendar.DateRange> weeks = WeekCalendar.weeksOf(
      Date.newInstance(2026, 6, 27),
      Date.newInstance(2026, 7, 8),
      everyDay
    );
    Assert.areEqual(2, weeks.size());
    Assert.areEqual(Date.newInstance(2026, 6, 27), weeks[0].startDate);
    Assert.areEqual(Date.newInstance(2026, 7, 3), weeks[0].endDate);
    Assert.areEqual(Date.newInstance(2026, 7, 4), weeks[1].startDate);
    Assert.areEqual(Date.newInstance(2026, 7, 8), weeks[1].endDate);
  }
}
