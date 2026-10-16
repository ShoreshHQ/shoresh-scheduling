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

  /**
   * Monday-to-Friday weeks covering startDate..endDate. The first week starts on the season's
   * first weekday and the last ends on its last weekday, so short first and last weeks are kept.
   */
  public static List<DateRange> weekdayWeeks(Date startDate, Date endDate) {
    List<DateRange> result = new List<DateRange>();
    Date cursor = startDate;
    while (cursor <= endDate) {
      Integer day = weekdayIndex(cursor);
      if (day >= 5) {
        cursor = cursor.addDays(7 - day);
        continue;
      }
      Date friday = cursor.addDays(4 - day);
      result.add(new DateRange(cursor, friday < endDate ? friday : endDate));
      cursor = friday.addDays(3);
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
