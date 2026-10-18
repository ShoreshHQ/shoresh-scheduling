/**
 * Reads a schedule's days (ScheduleDay__c), each one grid in one or more parts, joined. A day
 * that cannot be read says why instead. Saving is ScheduleDaySaves. Runs in user mode.
 */
public with sharing class ScheduleDays {
  /** One day as read: its grid, or why it could not be read. */
  public class DayGrid {
    public Date day;
    public Integer revision;
    public ScheduleGrid grid;
    public String problem;
  }

  /** The schedule's days, in date order. */
  public static List<DayGrid> read(Id scheduleId) {
    Map<Date, List<ScheduleDay__c>> partsByDay = new Map<Date, List<ScheduleDay__c>>();
    for (ScheduleDay__c part : [
      SELECT Date__c, Part__c, Grid__c, GridFormatVersion__c, Revision__c
      FROM ScheduleDay__c
      WHERE Schedule__c = :scheduleId
      WITH USER_MODE
      ORDER BY Date__c, Part__c
    ]) {
      if (!partsByDay.containsKey(part.Date__c)) {
        partsByDay.put(part.Date__c, new List<ScheduleDay__c>());
      }
      partsByDay.get(part.Date__c).add(part);
    }
    List<Date> dates = new List<Date>(partsByDay.keySet());
    dates.sort();
    List<DayGrid> days = new List<DayGrid>();
    for (Date day : dates) {
      days.add(readDay(day, partsByDay.get(day)));
    }
    return days;
  }

  private static DayGrid readDay(Date day, List<ScheduleDay__c> parts) {
    DayGrid result = new DayGrid();
    result.day = day;
    List<String> texts = new List<String>();
    try {
      if (parts[0].Revision__c == null) {
        throw new ScheduleGridRules.GridException('it has no revision');
      }
      result.revision = parts[0].Revision__c.intValue();
      for (Integer i = 0; i < parts.size(); i++) {
        checkPart(parts[i], i, result.revision);
        texts.add(parts[i].Grid__c);
      }
      result.grid = ScheduleGridParts.join(texts);
    } catch (ScheduleGridRules.GridException e) {
      result.problem = e.getMessage();
    }
    return result;
  }

  private static void checkPart(
    ScheduleDay__c part,
    Integer index,
    Integer revision
  ) {
    if (
      !ScheduleGridLocks.READABLE.contains(
        part.GridFormatVersion__c?.intValue()
      )
    ) {
      throw new ScheduleGridRules.GridException(
        'it was saved by a newer version of Shoresh'
      );
    }
    if (part.Part__c != index + 1 || part.Revision__c != revision) {
      throw new ScheduleGridRules.GridException(
        'its parts were not all saved together'
      );
    }
  }
}
