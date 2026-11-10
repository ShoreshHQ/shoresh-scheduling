/**
 * The days an elective set's times are read from (ELECT-4.8; repo ADR 0026): the run's schedule's
 * days, each day a special day replaces read from that special day's own grid instead of the
 * regular cells kept under it, so a set placed in a special day is an elective time of the week
 * and one placed in the regular day under it is not. A final run reads the special days as the
 * version Finalize kept carries them (ELECT-5.6), so its seats never change when a special day is
 * edited later. Runs in user mode; someone who may not read the special objects gets the
 * schedule's days as they are.
 */
public with sharing class ElectiveDays {
  /**
   * The week's special days on days of these, now, each with its own grid (null with a problem
   * when it can't be read). Two queries when the week has special days, one when it has none.
   */
  public static List<ScheduleSpecials.Special> replacingNow(
    Id weekId,
    List<ScheduleDays.DayGrid> days
  ) {
    List<ScheduleSpecials.Special> result = new List<ScheduleSpecials.Special>();
    if (weekId == null || !readable()) {
      return result;
    }
    Set<Date> dates = new Set<Date>();
    for (ScheduleDays.DayGrid day : days) {
      dates.add(day.day);
    }
    Set<Id> dayIds = new Set<Id>();
    for (SpecialDate__c row : [
      SELECT
        Day__c,
        SpecialDay__c,
        SpecialDay__r.Name,
        Week__r.StartDate__c,
        Week__r.EndDate__c
      FROM SpecialDate__c
      WHERE Week__c = :weekId AND SpecialDay__c != NULL
      WITH USER_MODE
      ORDER BY Day__c, Id
    ]) {
      Date onDate = SpecialDates.dateOf(
        row.Week__r.StartDate__c,
        row.Week__r.EndDate__c,
        row.Day__c
      );
      if (onDate != null && dates.contains(onDate)) {
        ScheduleSpecials.Special special = new ScheduleSpecials.Special();
        special.kind = ScheduleSpecials.DAY;
        special.itemId = row.SpecialDay__c;
        special.name = row.SpecialDay__r.Name;
        special.dateValue = onDate;
        result.add(special);
        dayIds.add(row.SpecialDay__c);
      }
    }
    if (dayIds.isEmpty()) {
      return result;
    }
    Map<Id, SpecialPlans.Plan> plans = SpecialPlans.readAll(dayIds);
    for (ScheduleSpecials.Special special : result) {
      SpecialPlans.Plan plan = plans.get(Id.valueOf(special.itemId));
      special.grid = plan.grid;
      special.problem = plan.problem;
    }
    return result;
  }

  /** The special days a version kept at Finalize carries (one query). */
  public static List<ScheduleSpecials.Special> carriedBy(Id scheduleId) {
    List<ScheduleSpecials.Special> result = new List<ScheduleSpecials.Special>();
    for (ScheduleSpecials.Special special : SpecialsCarried.read(scheduleId)) {
      if (special.kind == ScheduleSpecials.DAY) {
        result.add(special);
      }
    }
    return result;
  }

  /**
   * The days with each one a special day replaces read from its grid: one with no schedule yet
   * holds no elective time, and one that can't be read is said as the day's problem.
   */
  public static List<ScheduleDays.DayGrid> withSpecialDays(
    List<ScheduleDays.DayGrid> days,
    List<ScheduleSpecials.Special> specials
  ) {
    Map<Date, ScheduleSpecials.Special> byDate = new Map<Date, ScheduleSpecials.Special>();
    for (ScheduleSpecials.Special special : specials) {
      byDate.put(special.dateValue, special);
    }
    List<ScheduleDays.DayGrid> result = new List<ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : days) {
      ScheduleSpecials.Special special = byDate.get(day.day);
      if (special == null) {
        result.add(day);
      } else if (special.grid != null || special.problem != null) {
        ScheduleDays.DayGrid replaced = new ScheduleDays.DayGrid();
        replaced.day = day.day;
        replaced.grid = special.grid;
        replaced.problem = special.grid == null
          ? special.name + ': ' + special.problem
          : null;
        result.add(replaced);
      }
    }
    return result;
  }

  private static Boolean readable() {
    return Schema.sObjectType.SpecialDate__c.isAccessible() &&
      Schema.sObjectType.SpecialDay__c.isAccessible() &&
      Schema.sObjectType.PlanPart__c.isAccessible();
  }
}
