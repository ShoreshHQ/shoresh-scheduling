/**
 * The week's ticket (ADR 0005 §9): each day's revision as one line ("2026-06-29:3,2026-06-30:1"),
 * what a screen or agent was shown, so a change to the week can tell whether anyone saved a day
 * since. Its stamp, whether the week is still as seen, and the ticket a write leaves.
 *
 * What a missing ticket means differs by use, so each check names its rule (now: the stamp, or
 * text made from stamps; ticket: what was seen):
 * - seenBlankNever: no ticket, null or blank, is never as seen (SeenSaves.stamp).
 * - seenNullAsEmpty: null is read as '', so it is as seen only on a week with no days.
 * - seenNullNever: null is never as seen; '' is as seen on a week with no days; capitals are
 *   ignored (Apex's == on text).
 * - seenNullSkips: null is always as seen (not known, so not checked); otherwise seenNullNever.
 */
public with sharing class WeekTickets {
  /** The days' ticket: each day's revision, in the order given ('' for no days). */
  public static String stamp(List<ScheduleDays.DayGrid> days) {
    List<String> parts = new List<String>();
    for (ScheduleDays.DayGrid day : days) {
      parts.add(String.valueOf(day.day) + ':' + day.revision);
    }
    return String.join(parts, ',');
  }

  /**
   * The ticket after a write: each day at the revision the write gave it (written, as
   * ScheduleDaySaves.write returns it), or as read when the write left it alone.
   */
  public static String afterWrite(
    List<ScheduleDays.DayGrid> read,
    Map<Date, Integer> written
  ) {
    List<ScheduleDays.DayGrid> next = new List<ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : read) {
      ScheduleDays.DayGrid now = new ScheduleDays.DayGrid();
      now.day = day.day;
      now.revision = written.containsKey(day.day)
        ? written.get(day.day)
        : day.revision;
      next.add(now);
    }
    return stamp(next);
  }

  /** Still as seen, exactly; no ticket (null or blank) is never as seen. */
  public static Boolean seenBlankNever(String now, String ticket) {
    return SeenSaves.stamp(now, ticket);
  }

  /** Still as seen, exactly; no ticket (null) counts as '', a week with no days. */
  public static Boolean seenNullAsEmpty(String now, String ticket) {
    return (ticket ?? '').equals(now);
  }

  /**
   * Still as seen by Apex's == on text: a null ticket is never as seen, '' is a week with no
   * days, and capitals are ignored.
   */
  public static Boolean seenNullNever(String now, String ticket) {
    return now == ticket;
  }

  /** Still as seen, or not known (a null ticket is not checked); otherwise seenNullNever. */
  public static Boolean seenNullSkips(String now, String ticket) {
    return ticket == null || seenNullNever(now, ticket);
  }
}
