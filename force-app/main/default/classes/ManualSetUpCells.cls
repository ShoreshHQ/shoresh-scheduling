/**
 * Where setup puts each fixed and recurring activity in a Manual Build week now, as Start a blank
 * week puts them (BlankWeek): the counter leaves these cells out of its total whatever they hold,
 * so a week has one total however its cells change (LOCK-4.10), and Clear day or Clear week puts
 * one back where something was typed over it (LOCK-4.9). Setup that can't make a week yet (no
 * time blocks, no activities) gives none.
 */
public with sharing class ManualSetUpCells {
  /** One cell: "2026-06-29|<group Id>|<block Id>", what setup puts there, and its name. */
  public class Cell {
    @AuraEnabled
    public String key;
    // "F:<Id>" or "R:<Id>" where it starts; "^F:<Id>" in a block it carries on into.
    @AuraEnabled
    public String slot;
    @AuraEnabled
    public String name;
  }

  /** The program's week, read from setup now. */
  public static List<Cell> of(Id programId, Id weekId) {
    try {
      return of(BlankWeek.build(programId, weekId));
    } catch (ShoreshException notReady) {
      return new List<Cell>();
    }
  }

  /** The same, on setup Generated Schedule or a start has already read. */
  public static List<Cell> of(GeneratedSetup setup) {
    try {
      return of(BlankWeek.build(setup));
    } catch (ShoreshException notReady) {
      return new List<Cell>();
    }
  }

  private static List<Cell> of(BlankWeek.Week week) {
    List<Cell> result = new List<Cell>();
    for (ScheduleDaySaves.DaySave day : week.days) {
      for (Integer g = 0; g < day.grid.groups.size(); g++) {
        addRow(result, day, g);
      }
    }
    return result;
  }

  private static void addRow(
    List<Cell> result,
    ScheduleDaySaves.DaySave day,
    Integer g
  ) {
    ScheduleGrid grid = day.grid;
    ScheduleGrid.Item carrying = null;
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      String token = grid.rows[g][b];
      Boolean carries = token == ScheduleGrid.CARRIES_ON && carrying != null;
      carrying = carries ? carrying : setTimeOf(grid, token);
      if (carrying != null) {
        Cell cell = new Cell();
        cell.key =
          String.valueOf(day.day) +
          '|' +
          grid.groups[g].id +
          '|' +
          grid.blocks[b].id;
        cell.slot =
          (carries ? ScheduleGrid.CARRIES_ON : '') +
          carrying.kind +
          ':' +
          carrying.id;
        cell.name = carrying.name;
        result.add(cell);
      }
    }
  }

  /** The fixed or recurring activity a cell's token starts, or null. */
  private static ScheduleGrid.Item setTimeOf(ScheduleGrid grid, String token) {
    if (String.isBlank(token) || !token.isNumeric()) {
      return null;
    }
    ScheduleGrid.Item item = grid.items[Integer.valueOf(token) - 1];
    return item.kind == 'F' || item.kind == 'R' ? item : null;
  }
}
