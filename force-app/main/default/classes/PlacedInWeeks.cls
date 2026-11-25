/**
 * How many cells a group, activity, or location already has in a week's Manual Build and
 * Generated Schedule drafts, so turning it off for that week can ask first (Shoresh desktop
 * ExclusionConfirmDialog.jsx: "Placed in N slots in <week>.", shown as "cells", the design guide's word). As on the desktop, a cell is one
 * time block of one group: an activity two blocks long counts two. A location counts the cells
 * of the activities that use it. Versions and published schedules are not counted: they don't
 * change. Read in user mode: the days are listed first (their Ids only), then their text is read
 * a few at a time with a cap on queries, as GroupPlacements does. A day that can't be read, or
 * days past the cap, are said, never counted as nothing (the question would be missing).
 */
public with sharing class PlacedInWeeks {
  // Day parts read at once: 25 at the longest (131,072 characters) is about 3.3 million.
  @TestVisible
  private static Integer partsAtOnce = 25;
  // Queries for the text, after the ones that find the locations and list the days.
  @TestVisible
  private static Integer queryBudget = 60;

  public class Placed {
    @AuraEnabled
    public Id target { get; set; }
    @AuraEnabled
    public Id week { get; set; }
    @AuraEnabled
    public Integer cells { get; set; }
  }

  /** For each week off asked about (target and week), the cells placed; only those above 0. */
  public static List<Placed> count(List<RunsIn.WeekOff> asks) {
    Set<Id> weekIds = new Set<Id>();
    Set<Id> locationIds = new Set<Id>();
    for (RunsIn.WeekOff ask : asks) {
      if (ask.target != null && ask.week != null) {
        weekIds.add(ask.week);
        if (ask.target.getSObjectType() == Location__c.SObjectType) {
          locationIds.add(ask.target);
        }
      }
    }
    return placedFor(asks, cellsByWeek(weekIds, locationsOf(locationIds)));
  }

  /** The activities at these locations: activity -> location. */
  private static Map<Id, Id> locationsOf(Set<Id> locationIds) {
    Map<Id, Id> locationOf = new Map<Id, Id>();
    for (Activity__c activity : [
      SELECT Id, Location__c
      FROM Activity__c
      WHERE Location__c IN :locationIds
      WITH USER_MODE
    ]) {
      locationOf.put(activity.Id, activity.Location__c);
    }
    return locationOf;
  }

  /** week -> target -> cells, over the weeks' Manual Build and Generated Schedule drafts. */
  private static Map<Id, Map<Id, Integer>> cellsByWeek(
    Set<Id> weekIds,
    Map<Id, Id> locationOf
  ) {
    Map<Id, Map<Id, Integer>> byWeek = new Map<Id, Map<Id, Integer>>();
    List<Id> partIds = new List<Id>();
    for (ScheduleDay__c part : [
      SELECT Id
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Week__c IN :weekIds
        AND Schedule__r.Status__c = 'Draft'
        AND Schedule__r.Origin__c IN ('Manual', 'Generated')
      WITH USER_MODE
      ORDER BY Id
    ]) {
      partIds.add(part.Id);
    }
    Integer queries = 0;
    for (Integer i = 0; i < partIds.size(); i += partsAtOnce) {
      if (queries == queryBudget) {
        // Shoresh's own refusal (CORE-6.15): no support code.
        throw new ShoreshException(
          'Shoresh couldn\'t count every cell placed in these weeks. Turn them off a few weeks at a time.'
        );
      }
      List<Id> batch = new List<Id>();
      for (Integer j = i; j < Math.min(i + partsAtOnce, partIds.size()); j++) {
        batch.add(partIds[j]);
      }
      for (ScheduleDay__c day : [
        SELECT Id, Grid__c, Schedule__r.Week__c, Schedule__r.Week__r.Name
        FROM ScheduleDay__c
        WHERE Id IN :batch
        WITH USER_MODE
      ]) {
        Id weekId = day.Schedule__r.Week__c;
        if (!byWeek.containsKey(weekId)) {
          byWeek.put(weekId, new Map<Id, Integer>());
        }
        tally(day, locationOf, byWeek.get(weekId));
      }
      queries++;
    }
    return byWeek;
  }

  /** Each week off asked about whose target has cells placed that week. */
  private static List<Placed> placedFor(
    List<RunsIn.WeekOff> asks,
    Map<Id, Map<Id, Integer>> byWeek
  ) {
    List<Placed> result = new List<Placed>();
    for (RunsIn.WeekOff ask : asks) {
      Map<Id, Integer> counts = byWeek.get(ask.week);
      Integer cells = counts == null ||
        ask.target == null
        ? null
        : counts.get(ask.target);
      if (cells != null && cells > 0) {
        Placed placed = new Placed();
        placed.target = ask.target;
        placed.week = ask.week;
        placed.cells = cells;
        result.add(placed);
      }
    }
    return result;
  }

  /** Adds one day part's cells to each group, activity, and location they belong to. */
  private static void tally(
    ScheduleDay__c day,
    Map<Id, Id> locationOf,
    Map<Id, Integer> counts
  ) {
    ScheduleGrid grid;
    try {
      grid = ScheduleGrid.fromText(day.Grid__c);
    } catch (Exception e) {
      throw new ShoreshException(
        ErrorCodes.said(
          'Shoresh couldn\'t read a day of ' +
            day.Schedule__r.Week__r.Name +
            '\'s schedules, so it can\'t say what is placed there.',
          'PlacedInWeeks: day ' + day.Id + ': ' + ErrorCodes.detailOf(e)
        )
      );
    }
    for (Integer g = 0; g < grid.groups.size(); g++) {
      Id groupId = asId(grid.groups[g].id);
      for (ScheduleGrid.Item item : ScheduleGridCells.itemsIn(grid, g)) {
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
