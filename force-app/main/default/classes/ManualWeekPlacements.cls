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
