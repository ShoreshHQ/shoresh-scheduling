@IsTest
private class WeekCalendarTest {
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
  static void fullWeeksRunMondayToFriday() {
    List<WeekCalendar.DateRange> weeks = WeekCalendar.weekdayWeeks(
      Date.newInstance(2026, 6, 29),
      Date.newInstance(2026, 8, 7)
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
    List<WeekCalendar.DateRange> weeks = WeekCalendar.weekdayWeeks(
      Date.newInstance(2026, 7, 1),
      Date.newInstance(2026, 7, 14)
    );
    Assert.areEqual(3, weeks.size());
    Assert.areEqual(Date.newInstance(2026, 7, 1), weeks[0].startDate);
    Assert.areEqual(Date.newInstance(2026, 7, 3), weeks[0].endDate);
    Assert.areEqual(Date.newInstance(2026, 7, 13), weeks[2].startDate);
    Assert.areEqual(Date.newInstance(2026, 7, 14), weeks[2].endDate);
  }

  @IsTest
  static void aWeekendStartBeginsOnMonday() {
    List<WeekCalendar.DateRange> weeks = WeekCalendar.weekdayWeeks(
      Date.newInstance(2026, 6, 27),
      Date.newInstance(2026, 7, 5)
    );
    Assert.areEqual(1, weeks.size());
    Assert.areEqual(Date.newInstance(2026, 6, 29), weeks[0].startDate);
    Assert.areEqual(Date.newInstance(2026, 7, 3), weeks[0].endDate);
  }

  @IsTest
  static void aWeekendOnlyRangeHasNoWeeks() {
    Assert.areEqual(
      0,
      WeekCalendar.weekdayWeeks(
          Date.newInstance(2026, 7, 4),
          Date.newInstance(2026, 7, 5)
        )
        .size()
    );
  }
}
