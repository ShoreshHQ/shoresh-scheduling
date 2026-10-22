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
    for (
      List<String> row : grid == null ? new List<List<String>>() : grid.rows
    ) {
      for (String cell : row) {
        if (
          String.isNotBlank(cell) &&
          cell != ScheduleGrid.CARRIES_ON &&
          !isSetTime(grid.items[Integer.valueOf(cell) - 1])
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /** The fixed and recurring activities in the grid's cells, each name once, in the plan's order. */
  public static List<String> setTimesIn(ScheduleGrid grid) {
    List<String> result = new List<String>();
    for (
      List<String> row : grid == null ? new List<List<String>>() : grid.rows
    ) {
      for (String cell : row) {
        if (String.isBlank(cell) || cell == ScheduleGrid.CARRIES_ON) {
          continue;
        }
        ScheduleGrid.Item item = grid.items[Integer.valueOf(cell) - 1];
        if (isSetTime(item) && !result.contains(item.name)) {
          result.add(item.name);
        }
      }
    }
    return result;
  }

  private static Boolean isSetTime(ScheduleGrid.Item item) {
    return item.kind == 'F' || item.kind == 'R';
  }
}
