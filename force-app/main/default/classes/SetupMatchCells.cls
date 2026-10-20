/**
 * One day's grid as "Update to match setup" (SetupMatchDay) compares it: what each cell holds, as
 * its identity (SlotIds: '' Open, 'A:<Id>', '^A:<Id>'), and the placement it is part of (named by
 * its first cell). A cell is "groupId|blockId", both in their 18-character form, so two grids
 * with different time blocks or groups still name the same cell the same way.
 */
public with sharing class SetupMatchCells {
  public Map<String, String> held = new Map<String, String>();
  // The placements by their first cell, in the order of the day (group by group, block by block).
  public Map<String, List<String>> cellsOf = new Map<String, List<String>>();
  public List<String> placements = new List<String>();
  private Map<String, String> placementOf = new Map<String, String>();

  /** A grid's cells; none for no grid (a day one side doesn't have). */
  public SetupMatchCells(ScheduleGrid grid) {
    if (grid == null) {
      return;
    }
    for (Integer g = 0; g < grid.groups.size(); g++) {
      readRow(grid, g);
    }
  }

  private void readRow(ScheduleGrid grid, Integer g) {
    List<String> row = SlotIds.ofRow(grid, g);
    String first = null;
    for (Integer b = 0; b < row.size(); b++) {
      String cell = cellOf(grid.groups[g].id, grid.blocks[b].id);
      held.put(cell, row[b]);
      if (first == null || !SlotIds.isCarryOn(row[b])) {
        first = cell;
        cellsOf.put(first, new List<String>());
        placements.add(first);
      }
      cellsOf.get(first).add(cell);
      placementOf.put(cell, first);
    }
  }

  /** What a cell holds (Open when the grid doesn't have it). */
  public String at(String cell) {
    return held.containsKey(cell) ? held.get(cell) : SlotIds.OPEN;
  }

  /** The cells of the placement a cell is part of (none when the grid doesn't have it). */
  public List<String> cellsWith(String cell) {
    return placementOf.containsKey(cell)
      ? cellsOf.get(placementOf.get(cell))
      : new List<String>();
  }

  public static String cellOf(String groupId, String blockId) {
    return normal(groupId) + '|' + normal(blockId);
  }

  public static String groupOf(String cell) {
    return cell.substringBefore('|');
  }

  public static String blockOf(String cell) {
    return cell.substringAfter('|');
  }

  /** A record Id in its 18-character form (a text that isn't one stays as it is). */
  public static String normal(String value) {
    try {
      return String.valueOf(Id.valueOf(value));
    } catch (Exception e) {
      return value;
    }
  }

  /**
   * Whether two days have the same time blocks, at the same times and in the same order, and the
   * same groups. Rows stand alone, so groups may come in another order; time blocks may not (a
   * placement runs over blocks next to each other). A time block whose times changed makes the
   * day one change, so the times shown and published are never left as they were unseen.
   */
  public static Boolean sameFrame(ScheduleGrid was, ScheduleGrid now) {
    if (was == null || now == null) {
      return false;
    }
    return idLine(was.blockIds()) == idLine(now.blockIds()) &&
      timeLine(was) == timeLine(now) &&
      ids(was.groupIds()).equals(ids(now.groupIds()));
  }

  /** A grid's time block times, in order, as one line. */
  private static String timeLine(ScheduleGrid grid) {
    List<String> result = new List<String>();
    for (ScheduleGrid.Block block : grid.blocks) {
      result.add(timesOf(block));
    }
    return String.join(result, ',');
  }

  /** A time block's times as one text ("09:00-09:45"). */
  public static String timesOf(ScheduleGrid.Block block) {
    return block.startTime + '-' + block.endTime;
  }

  /** The Ids, in their 18-character form. */
  public static Set<String> ids(List<String> values) {
    Set<String> result = new Set<String>();
    for (String value : values) {
      result.add(normal(value));
    }
    return result;
  }

  /** The Ids, in their 18-character form and in order, as one line. */
  public static String idLine(List<String> values) {
    List<String> result = new List<String>();
    for (String value : values) {
      result.add(normal(value));
    }
    return String.join(result, ',');
  }

  /**
   * A grid on a frame's time blocks and groups (as it names them), holding the cells given
   * (identities by cell), its items listed in the order the cells first use them, each named
   * as setup names it now.
   */
  public static ScheduleGrid gridOf(
    ScheduleGrid frame,
    Map<String, String> cells,
    SetupMatchNames names
  ) {
    return new Writer(names).write(frame, cells);
  }

  /** Writes one grid, numbering its items as the cells first use them. */
  private class Writer {
    private SetupMatchNames names;
    private ScheduleGrid grid = new ScheduleGrid();
    private Map<String, String> tokenByOwner = new Map<String, String>();

    private Writer(SetupMatchNames names) {
      this.names = names;
    }

    private ScheduleGrid write(ScheduleGrid frame, Map<String, String> cells) {
      for (ScheduleGrid.Block block : frame.blocks) {
        grid.blocks.add(
          new ScheduleGrid.Block(block.id, block.name)
            .at(block.startTime, block.endTime)
        );
      }
      for (ScheduleGrid.GroupRef grp : frame.groups) {
        grid.groups.add(new ScheduleGrid.GroupRef(grp.id, grp.name));
        List<String> row = new List<String>();
        for (ScheduleGrid.Block block : frame.blocks) {
          row.add(tokenFor(cells.get(cellOf(grp.id, block.id))));
        }
        grid.rows.add(row);
      }
      return grid;
    }

    /** The stored cell for an identity, adding its item to the grid the first time. */
    private String tokenFor(String held) {
      if (String.isEmpty(held)) {
        return '';
      }
      if (SlotIds.isCarryOn(held)) {
        return ScheduleGrid.CARRIES_ON;
      }
      if (!tokenByOwner.containsKey(held)) {
        grid.items.add(names.itemNow(held));
        tokenByOwner.put(held, String.valueOf(grid.items.size()));
      }
      return tokenByOwner.get(held);
    }
  }
}
