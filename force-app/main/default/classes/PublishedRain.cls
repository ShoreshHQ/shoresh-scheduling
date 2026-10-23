/**
 * A day whose kept rainy-day marks (RainMarks.keptOn) differ between the published schedule and
 * the draft, as one line of what Publish changes ("Monday: rain marks changed", repo docs/adr/0019
 * choice 9): its cells can match while a raindrop has gone (an edit put the cell back) or come
 * back (a version restored), and the published page must not keep a stale one.
 */
public with sharing class PublishedRain {
  /** Adds the day's line to result when its marks differ; either side is null when it has no such day. */
  public static void addTo(
    PublishedChanges.Changes result,
    ScheduleDays.DayGrid was,
    ScheduleDays.DayGrid now
  ) {
    if (keptMarks(was) == keptMarks(now)) {
      return;
    }
    Date day = was == null ? now.day : was.day;
    result.rainDays++;
    result.add(WeekCalendar.weekdayName(day) + ': rain marks changed', 1);
  }

  private static Set<String> keptMarks(ScheduleDays.DayGrid day) {
    if (day == null) {
      return new Set<String>();
    }
    return new Set<String>(RainMarks.keptOn(day.grid, day.rain));
  }
}
