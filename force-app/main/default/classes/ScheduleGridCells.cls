/**
 * What a cell of a day's grid holds (ScheduleGrid, repo ADR 0005): the '^' carry-on and 1-based
 * item numbers read in one place. A cell outside its row (a short row, a group or time block that
 * isn't there) or a number naming no item holds nothing, so every reader gets the same answer for
 * a grid built in memory before ScheduleGridRules.check. Writers (SlotSaves) set the rows
 * directly.
 */
public with sharing class ScheduleGridCells {
  /** The item a cell holds: the one starting there, or the one carrying on into it; or null. */
  public static ScheduleGrid.Item itemAt(
    ScheduleGrid grid,
    Integer g,
    Integer b
  ) {
    Integer at = b;
    while (at > 0 && carriesOn(grid, g, at)) {
      at--;
    }
    return itemOf(grid, cellAt(grid, g, at));
  }

  /** Whether a cell carries on the item of the cell before it. */
  public static Boolean carriesOn(ScheduleGrid grid, Integer g, Integer b) {
    return cellAt(grid, g, b) == ScheduleGrid.CARRIES_ON;
  }

  /** The item each of a group's cells holds (as itemAt), one per time block, in order. */
  public static List<ScheduleGrid.Item> itemsIn(ScheduleGrid grid, Integer g) {
    List<ScheduleGrid.Item> result = new List<ScheduleGrid.Item>();
    ScheduleGrid.Item carrying = null;
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      carrying = carriesOn(grid, g, b)
        ? carrying
        : itemOf(grid, cellAt(grid, g, b));
      result.add(carrying);
    }
    return result;
  }

  /** A cell's text; '' when there is no such cell. */
  private static String cellAt(ScheduleGrid grid, Integer g, Integer b) {
    List<String> row = g >= 0 && g < grid.rows.size() ? grid.rows[g] : null;
    return row != null && b >= 0 && b < row.size() ? row[b] : '';
  }

  /** The item a cell's number names ("1" is the first), or null. */
  private static ScheduleGrid.Item itemOf(ScheduleGrid grid, String cell) {
    if (String.isBlank(cell) || !cell.isNumeric() || cell.length() > 9) {
      return null;
    }
    Integer index = Integer.valueOf(cell) - 1;
    return index >= 0 && index < grid.items.size() ? grid.items[index] : null;
  }
}
