/**
 * What a special day's or event's plan holds, for import (ADR 0014 choice 17): entries the
 * director put there, and the fixed and recurring activities it started with (choice 12), which
 * are not entries.
 */
public with sharing class SpecialPlanEntries {
  /**
   * Whether any cell holds something the director put there (an import is refused then). The
   * fixed and recurring activities the special day started with (SpecialDaySeed) are not that:
   * the desktop's seed is never a reason to refuse an import (its ADR 2026-08-22-event-schedule-import §6).
   */
  public static Boolean hasEntries(ScheduleGrid grid) {
    for (ScheduleGrid.Item item : startsIn(grid)) {
      if (!isSetTime(item)) {
        return true;
      }
    }
    return false;
  }

  /** The fixed and recurring activities in the grid's cells, each name once, in the plan's order. */
  public static List<String> setTimesIn(ScheduleGrid grid) {
    List<String> result = new List<String>();
    for (ScheduleGrid.Item item : startsIn(grid)) {
      if (isSetTime(item) && !result.contains(item.name)) {
        result.add(item.name);
      }
    }
    return result;
  }

  /** The item starting in each cell where one starts, row by row. */
  private static List<ScheduleGrid.Item> startsIn(ScheduleGrid grid) {
    List<ScheduleGrid.Item> result = new List<ScheduleGrid.Item>();
    for (Integer g = 0; grid != null && g < grid.groups.size(); g++) {
      List<ScheduleGrid.Item> held = ScheduleGridCells.itemsIn(grid, g);
      for (Integer b = 0; b < held.size(); b++) {
        if (held[b] != null && !ScheduleGridCells.carriesOn(grid, g, b)) {
          result.add(held[b]);
        }
      }
    }
    return result;
  }

  private static Boolean isSetTime(ScheduleGrid.Item item) {
    return item.kind == 'F' || item.kind == 'R';
  }
}
