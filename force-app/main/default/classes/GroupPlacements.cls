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
 * (their Ids and dates), then their text is read a few at a time (ScheduleDayTexts, as ScheduleUses
 * does); past its budget, or at a day that can't be read, the answer says it is not complete and
 * the screen says so, never a smaller count (CORE-6.19).
 */
public with sharing class GroupPlacements {
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
    Tally tally = new Tally(groupId);
    tally.read(
      [
        SELECT Id, Schedule__c, Date__c
        FROM ScheduleDay__c
        WHERE
          Schedule__r.Program__c = :programId
          AND Schedule__r.Status__c = 'Draft'
          AND Schedule__r.Origin__c IN ('Manual', 'Generated')
        WITH USER_MODE
        ORDER BY Schedule__c, Date__c, Part__c
      ]
    );
    result.complete = tally.complete && !tally.unreadable;
    for (Id activityId : tally.cells.keySet()) {
      Placed placed = new Placed();
      placed.activity = activityId;
      placed.cells = tally.cells.get(activityId);
      result.placed.add(placed);
    }
    return result;
  }

  /** The group's activity cells, by activity, in the days that name the group. */
  private with sharing class Tally extends ScheduleDayTexts.Reader {
    private Id groupId;
    // Both 15- and 18-character Ids hold the first 15.
    private String key;
    private Map<Id, Integer> cells = new Map<Id, Integer>();

    private Tally(Id groupId) {
      this.groupId = groupId;
      this.key = String.valueOf(groupId).left(15);
    }

    public override void take(List<ScheduleDay__c> parts) {
      if (!ScheduleDayTexts.names(parts, key)) {
        return;
      }
      ScheduleGrid grid = gridOf(parts).grid;
      if (grid == null) {
        return;
      }
      for (Integer g = 0; g < grid.groups.size(); g++) {
        if (asId(grid.groups[g].id) == groupId) {
          tallyRow(grid, g, cells);
        }
      }
    }
  }

  /** One group's row: each block of an activity counts one cell, the blocks it carries on into too. */
  private static void tallyRow(
    ScheduleGrid grid,
    Integer g,
    Map<Id, Integer> cells
  ) {
    for (ScheduleGrid.Item item : ScheduleGridCells.itemsIn(grid, g)) {
      Id activityId = activityOf(item);
      if (activityId != null) {
        cells.put(
          activityId,
          (cells.containsKey(activityId) ? cells.get(activityId) : 0) + 1
        );
      }
    }
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
