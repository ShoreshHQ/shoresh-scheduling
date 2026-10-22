/**
 * The week's special days and events as they are now, for these days of a schedule of it (ADR 0014
 * slice 5, ScheduleSpecials): each day a special day replaces (a weekday the schedule has), with
 * its own schedule and only the day's groups, then each special event placed on a day not
 * replaced that has a schedule of its own, by name. Two queries at most: the week's special days
 * (none when the week was read with them, ProgramReads.weekWithSpecialDays), then every plan.
 * Runs in user mode; someone who may not read the special objects gets none.
 */
public with sharing class SpecialsNow {
  /** The week's (by Id): its special days are read here. */
  public static List<ScheduleSpecials.Special> of(
    Id weekId,
    List<ScheduleDays.DayGrid> days
  ) {
    if (!usable(days)) {
      return new List<ScheduleSpecials.Special>();
    }
    List<SpecialDate__c> rows = [
      SELECT
        Day__c,
        SpecialDay__c,
        SpecialDay__r.Name,
        SpecialDay__r.Notes__c,
        Week__r.StartDate__c,
        Week__r.EndDate__c
      FROM SpecialDate__c
      WHERE Week__c = :weekId AND SpecialDay__c != NULL
      WITH USER_MODE
      ORDER BY Day__c, Id
    ];
    return rows.isEmpty()
      ? fromRows(new Week__c(Id = weekId), rows, days)
      : fromRows(rows[0].Week__r, rows, days);
  }

  /** The same, from a week read with its special days (ProgramReads.weekWithSpecialDays). */
  public static List<ScheduleSpecials.Special> ofWeek(
    Week__c week,
    List<ScheduleDays.DayGrid> days
  ) {
    if (!usable(days)) {
      return new List<ScheduleSpecials.Special>();
    }
    return fromRows(week, week.SpecialDates__r, days);
  }

  /** week: its dates; rows: its special days. */
  private static List<ScheduleSpecials.Special> fromRows(
    Week__c week,
    List<SpecialDate__c> rows,
    List<ScheduleDays.DayGrid> days
  ) {
    Map<Date, ScheduleDays.DayGrid> byDate = new Map<Date, ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : days) {
      byDate.put(day.day, day);
    }
    List<ScheduleSpecials.Special> result = replacedDays(week, rows, byDate);
    Map<Id, String> eventNames = eventsOn(
      days,
      ScheduleSpecials.replacedDates(
        result,
        new List<ScheduleSpecials.Special>()
      )
    );
    Set<Id> itemIds = new Set<Id>(eventNames.keySet());
    for (ScheduleSpecials.Special special : result) {
      itemIds.add(Id.valueOf(special.itemId));
    }
    if (itemIds.isEmpty()) {
      return result;
    }
    Map<Id, SpecialPlans.Plan> plans = SpecialPlans.readAll(itemIds);
    for (ScheduleSpecials.Special special : result) {
      SpecialPlans.Plan plan = plans.get(Id.valueOf(special.itemId));
      special.problem = plan.problem;
      special.grid = plan.grid == null
        ? null
        : WeekSpecials.onlyGroups(
            plan.grid,
            groupIdsOf(byDate.get(special.dateValue))
          );
    }
    result.addAll(events(eventNames, plans));
    ScheduleSpecials.sort(result);
    return result;
  }

  /** The days of the schedule a special day replaces. */
  private static List<ScheduleSpecials.Special> replacedDays(
    Week__c week,
    List<SpecialDate__c> rows,
    Map<Date, ScheduleDays.DayGrid> byDate
  ) {
    List<ScheduleSpecials.Special> result = new List<ScheduleSpecials.Special>();
    for (SpecialDate__c row : rows) {
      Date onDate = SpecialDates.dateOf(
        week.StartDate__c,
        week.EndDate__c,
        row.Day__c
      );
      // The week no longer has that weekday, or this schedule doesn't run on it: not replaced.
      if (onDate != null && byDate.containsKey(onDate)) {
        ScheduleSpecials.Special special = new ScheduleSpecials.Special();
        special.kind = ScheduleSpecials.DAY;
        special.itemId = row.SpecialDay__c;
        special.name = row.SpecialDay__r.Name;
        special.notes = row.SpecialDay__r.Notes__c;
        special.dateValue = onDate;
        result.add(special);
      }
    }
    return result;
  }

  /** The events with a schedule of their own (one with none yet has nothing to open), by name. */
  private static List<ScheduleSpecials.Special> events(
    Map<Id, String> eventNames,
    Map<Id, SpecialPlans.Plan> plans
  ) {
    List<ScheduleSpecials.Special> result = new List<ScheduleSpecials.Special>();
    for (Id eventId : eventNames.keySet()) {
      SpecialPlans.Plan plan = plans.get(eventId);
      if (plan.grid != null || plan.problem != null) {
        ScheduleSpecials.Special special = new ScheduleSpecials.Special();
        special.kind = ScheduleSpecials.EVENT;
        special.itemId = eventId;
        special.name = eventNames.get(eventId);
        special.grid = plan.grid;
        special.problem = plan.problem;
        result.add(special);
      }
    }
    return result;
  }

  /**
   * The special events placed (with their records) on the days not replaced, each with its name
   * as the schedule has it. Also what SpecialChanges reads to tell an event still placed whose own
   * schedule was added or removed.
   */
  public static Map<Id, String> eventsOn(
    List<ScheduleDays.DayGrid> days,
    Set<Date> replaced
  ) {
    Map<Id, String> result = new Map<Id, String>();
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid != null && !replaced.contains(day.day)) {
        addEvents(day.grid, result);
      }
    }
    return result;
  }

  /** Adds the grid's special events that a cell holds. */
  private static void addEvents(ScheduleGrid grid, Map<Id, String> result) {
    Set<String> used = new Set<String>();
    for (List<String> row : grid.rows) {
      used.addAll(row);
    }
    for (Integer i = 0; i < grid.items.size(); i++) {
      ScheduleGrid.Item item = grid.items[i];
      Id eventId = asId(item.id);
      if (
        item.kind == ScheduleSpecials.EVENT &&
        eventId != null &&
        used.contains(String.valueOf(i + 1)) &&
        !result.containsKey(eventId)
      ) {
        result.put(eventId, item.name);
      }
    }
  }

  private static Set<Id> groupIdsOf(ScheduleDays.DayGrid day) {
    Set<Id> result = new Set<Id>();
    if (day.grid == null) {
      return result;
    }
    for (ScheduleGrid.GroupRef grp : day.grid.groups) {
      Id groupId = asId(grp.id);
      if (groupId != null) {
        result.add(groupId);
      }
    }
    return result;
  }

  private static Id asId(String text) {
    if (String.isBlank(text)) {
      return null;
    }
    try {
      return Id.valueOf(text);
    } catch (StringException e) {
      return null;
    }
  }

  /** Some days, and the special objects readable. */
  private static Boolean usable(List<ScheduleDays.DayGrid> days) {
    return !days.isEmpty() && readable();
  }

  private static Boolean readable() {
    return Schema.sObjectType.SpecialDate__c.isAccessible() &&
      Schema.sObjectType.SpecialDay__c.isAccessible() &&
      Schema.sObjectType.SpecialEvent__c.isAccessible() &&
      Schema.sObjectType.PlanPart__c.isAccessible();
  }
}
