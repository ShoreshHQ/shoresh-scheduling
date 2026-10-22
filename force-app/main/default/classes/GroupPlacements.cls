/**
 * Which activities a group is already placed in, and in how many cells, across its program's
 * Manual Build and Generated Schedule drafts, so the Groups screen can say, before a group moves
 * to another division, which of those placements its new division is not set up for (ADR 0006
 * §16, deferred by Greg to this move). The placements stay where they are and the schedule marks
 * them ("Not set up for Bunk 3", ADR 0008); nothing is moved or removed. Saved versions and
 * published schedules are not counted: they are history and don't change. As in PlacedInWeeks, a
 * cell is one time block of one group, so an activity two blocks long counts two.
 *
 * Runs in user mode: only schedules the director can see are read. The days are listed first
 * (their Ids only), then their text is read a few at a time, as ScheduleUses does, with a cap on
 * queries; past it the answer says it is not complete and the screen says so.
 */
public with sharing class GroupPlacements {
  // Day parts read at once: 25 at the longest (131,072 characters) is about 3.3 million.
  @TestVisible
  private static Integer partsAtOnce = 25;
  // Queries for the text, after the two that find the program and list the days.
  @TestVisible
  private static Integer queryBudget = 60;

  public class Placed {
    @AuraEnabled
    public Id activity;
    @AuraEnabled
    public Integer cells;
  }

  public class Result {
    @AuraEnabled
    public List<Placed> placed = new List<Placed>();
    @AuraEnabled
    public Boolean complete = true;
  }

  public static Result of(Id groupId) {
    Result result = new Result();
    if (groupId == null || groupId.getSObjectType() != Group__c.SObjectType) {
      return result;
    }
    List<Group__c> found = [
      SELECT Division__r.Program__c
      FROM Group__c
      WHERE Id = :groupId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      return result;
    }
    Id programId = found[0].Division__r.Program__c;
    List<Id> partIds = new List<Id>();
    for (ScheduleDay__c part : [
      SELECT Id
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Program__c = :programId
        AND Schedule__r.Status__c = 'Draft'
        AND Schedule__r.Origin__c IN ('Manual', 'Generated')
      WITH USER_MODE
      ORDER BY Id
    ]) {
      partIds.add(part.Id);
    }
    Map<Id, Integer> cells = new Map<Id, Integer>();
    Integer queries = 0;
    for (Integer i = 0; i < partIds.size(); i += partsAtOnce) {
      if (queries == queryBudget) {
        result.complete = false;
        break;
      }
      List<Id> batch = new List<Id>();
      for (Integer j = i; j < Math.min(i + partsAtOnce, partIds.size()); j++) {
        batch.add(partIds[j]);
      }
      tallyParts(batch, groupId, cells);
      queries++;
    }
    for (Id activityId : cells.keySet()) {
      Placed placed = new Placed();
      placed.activity = activityId;
      placed.cells = cells.get(activityId);
      result.placed.add(placed);
    }
    return result;
  }

  private static void tallyParts(
    List<Id> partIds,
    Id groupId,
    Map<Id, Integer> cells
  ) {
    // Both 15- and 18-character Ids hold the first 15.
    String key = String.valueOf(groupId).left(15);
    for (ScheduleDay__c part : [
      SELECT Grid__c
      FROM ScheduleDay__c
      WHERE Id IN :partIds
      WITH USER_MODE
    ]) {
      if (part.Grid__c != null && part.Grid__c.contains(key)) {
        tally(part.Grid__c, groupId, cells);
      }
    }
  }

  /** Adds the group's activity cells in one day part; a part that can't be read adds nothing. */
  private static void tally(String text, Id groupId, Map<Id, Integer> cells) {
    ScheduleGrid grid = readGrid(text);
    if (grid == null) {
      return;
    }
    for (Integer g = 0; g < grid.rows.size() && g < grid.groups.size(); g++) {
      if (asId(grid.groups[g].id) == groupId) {
        tallyRow(grid, grid.rows[g], cells);
      }
    }
  }

  private static ScheduleGrid readGrid(String text) {
    try {
      return ScheduleGrid.fromText(text);
    } catch (Exception e) {
      return null;
    }
  }

  /** One group's row: each block of an activity counts one cell, "^" carrying the one above on. */
  private static void tallyRow(
    ScheduleGrid grid,
    List<String> row,
    Map<Id, Integer> cells
  ) {
    ScheduleGrid.Item carrying;
    for (String cell : row) {
      carrying = cell == ScheduleGrid.CARRIES_ON
        ? carrying
        : itemAt(grid, cell);
      Id activityId = activityOf(carrying);
      if (activityId != null) {
        cells.put(
          activityId,
          (cells.containsKey(activityId) ? cells.get(activityId) : 0) + 1
        );
      }
    }
  }

  /** The item a cell names ("1" is the first), or null for an empty cell or one out of range. */
  private static ScheduleGrid.Item itemAt(ScheduleGrid grid, String cell) {
    if (String.isBlank(cell) || !cell.isNumeric()) {
      return null;
    }
    Integer at = Integer.valueOf(cell) - 1;
    return at >= 0 && at < grid.items.size() ? grid.items[at] : null;
  }

  private static Id activityOf(ScheduleGrid.Item item) {
    return item != null && item.kind == 'A' ? asId(item.id) : null;
  }

  private static Id asId(String value) {
    try {
      return String.isBlank(value) ? null : Id.valueOf(value);
    } catch (Exception e) {
      return null;
    }
  }
}
