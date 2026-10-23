/**
 * Reading a day's grid cell by cell (ScheduleGrid, repo ADR 0005): the item a cell holds, following
 * '^' to the cell it carries on from, and whether a grid's text is a record Id. For the elective
 * seats' reads (ElectiveTimes, ElectivePlaceClashes; repo ADR 0018 slice E7).
 */
public with sharing class GridItems {
  /** Whether a grid's text is a record Id (an item not set up yet has none). */
  public static Boolean isId(String text) {
    if (String.isBlank(text) || (text.length() != 15 && text.length() != 18)) {
      return false;
    }
    try {
      return Id.valueOf(text) != null;
    } catch (Exception e) {
      return false;
    }
  }

  /** The item in a cell, following '^' up to the cell it carries on from. */
  public static ScheduleGrid.Item itemAt(
    ScheduleGrid grid,
    Integer g,
    Integer b
  ) {
    Integer at = b;
    while (at >= 0 && grid.rows[g][at] == ScheduleGrid.CARRIES_ON) {
      at--;
    }
    String cell = at < 0 ? '' : grid.rows[g][at];
    if (String.isBlank(cell) || !cell.isNumeric()) {
      return null;
    }
    Integer index = Integer.valueOf(cell) - 1;
    return index >= 0 && index < grid.items.size() ? grid.items[index] : null;
  }
}
