/**
 * What a week's schedules need of special days (ADR 0014 slice 4; desktop ADR
 * 2026-10-09-special-day-binds-to-a-week-day): the week's days a special day replaces, each with
 * the special day's own schedule to show in that day's place, on Manual Build and Generated
 * Schedule alike. (The season's special events, to place on the grid, come with the season setup
 * the screens already have.) The week's special days are one query (none for Generated Schedule,
 * which reads them with its week: ProgramReads.weekWithSpecialDays), their plans one more, plus
 * one look-up per kind of record the plans point at. Runs in user mode; someone who may not read
 * the special objects gets none, and the week shows as it is.
 */
public with sharing class WeekSpecials {
  public class Specials {
    // The week's days a special day replaces, in date order.
    @AuraEnabled
    public List<ReplacedDay> days = new List<ReplacedDay>();
  }

  /** One day of the week a special day replaces, for the whole camp. */
  public class ReplacedDay {
    @AuraEnabled
    public Date dateValue;
    // The weekday it is put on ("Friday").
    @AuraEnabled
    public String day;
    @AuraEnabled
    public Id specialDayId;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String notes;
    // The special day's own schedule as that date's day (its time blocks, the program's groups),
    // read-only; no rows when it has none yet.
    @AuraEnabled
    public ScheduleViews.DayView plan;
  }

  /**
   * The week's replaced days, read now. groups: the program's groups, in order: a replaced day
   * shows their columns of the special day (the whole camp's when it has none of them).
   */
  public static Specials read(Week__c week, List<Group__c> groups) {
    if (!readable()) {
      return new Specials();
    }
    return fromDates(
      week,
      [
        SELECT
          Id,
          Day__c,
          SpecialDay__c,
          SpecialDay__r.Name,
          SpecialDay__r.Notes__c
        FROM SpecialDate__c
        WHERE Week__c = :week.Id AND SpecialDay__c != NULL
        WITH USER_MODE
        ORDER BY Day__c, Id
      ],
      groups
    );
  }

  /** The same, from a week read with its special days (ProgramReads.weekWithSpecialDays). */
  public static Specials ofWeek(Week__c week, List<Group__c> groups) {
    if (!readable() || week.SpecialDates__r == null) {
      return new Specials();
    }
    return fromDates(week, week.SpecialDates__r, groups);
  }

  private static Specials fromDates(
    Week__c week,
    List<SpecialDate__c> placed,
    List<Group__c> groups
  ) {
    Specials result = new Specials();
    if (placed.isEmpty()) {
      return result;
    }
    Set<Id> dayIds = new Set<Id>();
    for (SpecialDate__c row : placed) {
      dayIds.add(row.SpecialDay__c);
    }
    Map<Id, SpecialPlans.Plan> plans = SpecialPlans.readAll(dayIds);
    List<ScheduleDays.DayGrid> grids = new List<ScheduleDays.DayGrid>();
    for (SpecialDate__c row : placed) {
      Date onDate = SpecialDates.dateOf(
        week.StartDate__c,
        week.EndDate__c,
        row.Day__c
      );
      if (onDate == null) {
        // The week no longer has that weekday (its dates moved): nothing is replaced.
        continue;
      }
      ReplacedDay replaced = new ReplacedDay();
      replaced.dateValue = onDate;
      replaced.day = row.Day__c;
      replaced.specialDayId = row.SpecialDay__c;
      replaced.name = row.SpecialDay__r.Name;
      replaced.notes = row.SpecialDay__r.Notes__c;
      result.days.add(replaced);
      SpecialPlans.Plan plan = plans.get(row.SpecialDay__c);
      ScheduleDays.DayGrid grid = new ScheduleDays.DayGrid();
      grid.day = onDate;
      grid.grid = plan.grid == null ? null : onlyGroups(plan.grid, groups);
      grid.problem = plan.problem;
      grids.add(grid);
    }
    List<ScheduleViews.DayView> views = ScheduleViews.dayViews(grids);
    for (Integer i = 0; i < views.size(); i++) {
      result.days[i].plan = views[i];
    }
    sortByDate(result.days);
    return result;
  }

  /**
   * The weekdays of a week a special day replaces, each with the special day's name ("Friday" =>
   * "Visiting Day"): what an edit on that day is refused for.
   */
  public static Map<String, String> replacedNames(Id weekId) {
    Map<String, String> result = new Map<String, String>();
    if (!readable()) {
      return result;
    }
    for (SpecialDate__c row : [
      SELECT Day__c, SpecialDay__r.Name
      FROM SpecialDate__c
      WHERE Week__c = :weekId AND SpecialDay__c != NULL
      WITH USER_MODE
    ]) {
      result.put(row.Day__c, row.SpecialDay__r.Name);
    }
    return result;
  }

  private static Boolean readable() {
    return Schema.sObjectType.SpecialDate__c.isAccessible() &&
      Schema.sObjectType.SpecialDay__c.isAccessible() &&
      Schema.sObjectType.SpecialEvent__c.isAccessible();
  }

  /**
   * The special day's grid with only the program's groups, in the special day's order; the whole
   * grid when it has none of them (a group added since is not a column of it yet: ADR 0014).
   */
  private static ScheduleGrid onlyGroups(
    ScheduleGrid grid,
    List<Group__c> groups
  ) {
    Set<Id> wanted = new Set<Id>();
    for (Group__c grp : groups) {
      wanted.add(grp.Id);
    }
    ScheduleGrid shown = new ScheduleGrid();
    shown.blocks = grid.blocks;
    shown.items = grid.items;
    for (Integer g = 0; g < grid.groups.size(); g++) {
      if (isOneOf(grid.groups[g].id, wanted)) {
        shown.groups.add(grid.groups[g]);
        shown.rows.add(grid.rows[g]);
      }
    }
    return shown.groups.isEmpty() ? grid : shown;
  }

  private static Boolean isOneOf(String text, Set<Id> ids) {
    try {
      return ids.contains(Id.valueOf(text));
    } catch (Exception e) {
      return false;
    }
  }

  private static void sortByDate(List<ReplacedDay> days) {
    for (Integer i = 1; i < days.size(); i++) {
      ReplacedDay current = days[i];
      Integer j = i - 1;
      while (j >= 0 && days[j].dateValue > current.dateValue) {
        days[j + 1] = days[j];
        j--;
      }
      days[j + 1] = current;
    }
  }
}
