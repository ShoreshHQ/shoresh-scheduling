/**
 * How many slots a group, activity, or location already has in a week's Manual Build and
 * Generated Schedule drafts, so turning it off for that week can ask first (Shoresh desktop
 * ExclusionConfirmDialog.jsx: "Placed in N slots in <week>."). As on the desktop, a slot is one
 * time block of one group: an activity two blocks long counts two. A location counts the slots
 * of the activities that use it. Versions and published schedules are not counted: they don't
 * change. Read in user mode; a day that can't be read counts nothing.
 */
public with sharing class PlacedInWeeks {
  public class Placed {
    @AuraEnabled
    public Id target { get; set; }
    @AuraEnabled
    public Id week { get; set; }
    @AuraEnabled
    public Integer slots { get; set; }
  }

  /** For each week off asked about (target and week), the slots placed; only those above 0. */
  public static List<Placed> count(List<RunsIn.WeekOff> asks) {
    Set<Id> weekIds = new Set<Id>();
    Set<Id> locationIds = new Set<Id>();
    for (RunsIn.WeekOff ask : asks) {
      if (ask.target == null || ask.week == null) {
        continue;
      }
      weekIds.add(ask.week);
      if (ask.target.getSObjectType() == Location__c.SObjectType) {
        locationIds.add(ask.target);
      }
    }
    Map<Id, Id> locationOf = new Map<Id, Id>();
    for (Activity__c activity : [
      SELECT Id, Location__c
      FROM Activity__c
      WHERE Location__c IN :locationIds
      WITH USER_MODE
    ]) {
      locationOf.put(activity.Id, activity.Location__c);
    }
    // week -> target -> slots
    Map<Id, Map<Id, Integer>> byWeek = new Map<Id, Map<Id, Integer>>();
    for (ScheduleDay__c day : [
      SELECT Grid__c, Schedule__r.Week__c
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Week__c IN :weekIds
        AND Schedule__r.Status__c = 'Draft'
        AND Schedule__r.Origin__c IN ('Manual', 'Generated')
      WITH USER_MODE
    ]) {
      Id weekId = day.Schedule__r.Week__c;
      if (!byWeek.containsKey(weekId)) {
        byWeek.put(weekId, new Map<Id, Integer>());
      }
      tally(day.Grid__c, locationOf, byWeek.get(weekId));
    }
    List<Placed> result = new List<Placed>();
    for (RunsIn.WeekOff ask : asks) {
      Map<Id, Integer> counts = byWeek.get(ask.week);
      Integer slots = counts == null || ask.target == null
        ? null
        : counts.get(ask.target);
      if (slots != null && slots > 0) {
        Placed placed = new Placed();
        placed.target = ask.target;
        placed.week = ask.week;
        placed.slots = slots;
        result.add(placed);
      }
    }
    return result;
  }

  /** Adds one day part's slots to each group, activity, and location they belong to. */
  private static void tally(
    String text,
    Map<Id, Id> locationOf,
    Map<Id, Integer> counts
  ) {
    ScheduleGrid grid;
    try {
      grid = ScheduleGrid.fromText(text);
    } catch (Exception e) {
      return;
    }
    for (Integer g = 0; g < grid.rows.size(); g++) {
      Id groupId = asId(grid.groups[g].id);
      ScheduleGrid.Item carrying;
      for (String cell : grid.rows[g]) {
        ScheduleGrid.Item item;
        if (cell == ScheduleGrid.CARRIES_ON) {
          item = carrying;
        } else if (String.isNotBlank(cell)) {
          item = grid.items[Integer.valueOf(cell) - 1];
        }
        carrying = item;
        if (item == null) {
          continue;
        }
        add(counts, groupId);
        if (item.kind == 'A') {
          Id activityId = asId(item.id);
          add(counts, activityId);
          add(counts, locationOf.get(activityId));
        }
      }
    }
  }

  private static void add(Map<Id, Integer> counts, Id target) {
    if (target != null) {
      counts.put(
        target,
        (counts.containsKey(target) ? counts.get(target) : 0) + 1
      );
    }
  }

  private static Id asId(String value) {
    try {
      return String.isBlank(value) ? null : Id.valueOf(value);
    } catch (Exception e) {
      return null;
    }
  }
}
