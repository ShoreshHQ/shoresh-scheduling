/**
 * Date arithmetic for weeks, kept in one place so the screens' preview and the saved records
 * always agree. Pure: no queries, no DML.
 */
public with sharing class WeekCalendar {
  // 1 January 1900 was a Monday; counting from it gives the weekday in any locale.
  private static final Date A_MONDAY = Date.newInstance(1900, 1, 1);
  private static final List<String> DAY_NAMES = new List<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  };

  /** 0 = Monday ... 6 = Sunday. */
  public static Integer weekdayIndex(Date d) {
    return Math.mod(A_MONDAY.daysBetween(d), 7);
  }

  public static String weekdayName(Date d) {
    return DAY_NAMES[weekdayIndex(d)];
  }

  /** Monday to Friday: the days a camp runs when nothing says otherwise. */
  public static Set<String> mondayToFriday() {
    return new Set<String>{
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday'
    };
  }

  /**
   * Where a week of these days starts (0 = Monday ... 6 = Sunday): the first day after the
   * longest run of days off, so Sunday to Thursday starts on Sunday. Every day (or none):
   * allDays. c/shoreshImportEngine firstDayOf does the same for the screens.
   */
  public static Integer firstDayOf(Set<String> days, Integer allDays) {
    Integer best = -1;
    Integer longest = 0;
    for (Integer i = 0; i < 7; i++) {
      Integer gap = 0;
      while (
        gap < 7 &&
        days.contains(DAY_NAMES[i]) &&
        !days.contains(DAY_NAMES[Math.mod(i + 6 - gap, 7)])
      ) {
        gap++;
      }
      if (gap > longest) {
        best = i;
        longest = gap;
      }
    }
    return best < 0 ? allDays : best;
  }

  /**
   * Weeks covering startDate..endDate on these days ('Monday'...): each starts on the first of
   * the days (firstDayOf; the season's own first day when it runs every day) and holds the days
   * that fall in the season, so short first and last weeks are kept.
   */
  public static List<DateRange> weeksOf(
    Date startDate,
    Date endDate,
    Set<String> days
  ) {
    List<DateRange> result = new List<DateRange>();
    Integer weekStart = firstDayOf(days, weekdayIndex(startDate));
    Date cursor = startDate.addDays(
      -Math.mod(weekdayIndex(startDate) - weekStart + 7, 7)
    );
    while (cursor <= endDate) {
      Date first;
      Date last;
      for (Integer i = 0; i < 7; i++) {
        Date day = cursor.addDays(i);
        if (
          day >= startDate &&
          day <= endDate &&
          days.contains(weekdayName(day))
        ) {
          first = first == null ? day : first;
          last = day;
        }
      }
      if (first != null) {
        result.add(new DateRange(first, last));
      }
      cursor = cursor.addDays(7);
    }
    return result;
  }

  public class DateRange {
    @AuraEnabled
    public Date startDate;
    @AuraEnabled
    public Date endDate;

    public DateRange(Date startDate, Date endDate) {
      this.startDate = startDate;
      this.endDate = endDate;
    }
  }
}
