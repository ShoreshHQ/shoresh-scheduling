/**
 * Reading a schedule day's grid for "Start from another week" (ManualWeekCopy): a group's
 * placements (where each starts, how long it runs, what it is) and the names the grid gives them.
 */
public with sharing class ManualWeekPlacements {
  /** One placement of the source day: where it starts, how long it runs, what it is. */
  public class Placement {
    public ScheduleGrid grid;
    public Integer first;
    public Integer length = 1;
    public String slot;
  }

  /** A group's placements on a source day, set-time items aside (this week has its own). */
  public static List<Placement> of(ScheduleGrid grid, Integer g) {
    List<Placement> result = new List<Placement>();
    List<String> row = SlotIds.ofRow(grid, g);
    for (Integer b = 0; b < row.size(); b++) {
      String slot = row[b];
      if (
        slot == SlotIds.OPEN ||
        SlotIds.isCarryOn(slot) ||
        SlotIds.isSetTime(slot)
      ) {
        continue;
      }
      Placement p = new Placement();
      p.grid = grid;
      p.first = b;
      p.slot = slot;
      while (
        b + p.length < row.size() &&
        row[b + p.length] == ScheduleGrid.CARRIES_ON + slot
      ) {
        p.length++;
      }
      result.add(p);
    }
    return result;
  }

  /** Where a placement's blocks start on a day, or -1 if it lacks any of them in a row. */
  public static Integer firstBlockOn(Placement p, List<String> blockIds) {
    Integer first = SlotIds.indexOf(blockIds, p.grid.blocks[p.first].id);
    for (Integer i = 1; first >= 0 && i < p.length; i++) {
      if (
        blockIds.size() <= first + i ||
        blockIds[first + i] != p.grid.blocks[p.first + i].id
      ) {
        return -1;
      }
    }
    return first;
  }

  /** Whether a row of a grid holds this very placement: the same blocks, no shorter or longer. */
  public static Boolean holds(
    Placement p,
    ScheduleGrid grid,
    List<String> row
  ) {
    Integer first = firstBlockOn(p, grid.blockIds());
    if (first < 0 || row[first] != p.slot) {
      return false;
    }
    for (Integer i = 1; i < p.length; i++) {
      if (row[first + i] != ScheduleGrid.CARRIES_ON + p.slot) {
        return false;
      }
    }
    Integer next = first + p.length;
    return next == row.size() || row[next] != ScheduleGrid.CARRIES_ON + p.slot;
  }

  /** Whether a grid has any activity placed (set-time items aside). */
  public static Boolean hasActivities(ScheduleGrid grid) {
    for (Integer g = 0; g < grid.groups.size(); g++) {
      if (!of(grid, g).isEmpty()) {
        return true;
      }
    }
    return false;
  }

  /** The name a grid gives what a slot holds. */
  public static String nameOf(ScheduleGrid grid, String slot) {
    String item = SlotIds.owner(slot);
    for (ScheduleGrid.Item candidate : grid.items) {
      if (SlotIds.of(candidate) == item) {
        return candidate.name;
      }
    }
    return item;
  }
}
