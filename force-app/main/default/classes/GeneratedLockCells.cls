/**
 * The cells a lock change names, and the placements they belong to (GeneratedLocks), and what a
 * hand edit locks (GeneratedEdits). A lock always covers a whole placement, the blocks a
 * multi-block activity carries on into, as the engine keeps it; fixed and recurring activities
 * are never locked.
 */
public with sharing class GeneratedLockCells {
  /** Locks or unlocks every cell the change names; returns how many cells it named. */
  public static Integer apply(
    List<ScheduleDays.DayGrid> days,
    GeneratedWeek.LockChange change
  ) {
    Integer named = 0;
    for (ScheduleDays.DayGrid day : days) {
      if (change.dateValue == null || change.dateValue == day.day) {
        named += cellsIn(day.grid, change);
      }
    }
    return named;
  }

  private static Integer cellsIn(
    ScheduleGrid grid,
    GeneratedWeek.LockChange change
  ) {
    Integer named = 0;
    for (Integer g = 0; g < grid.groups.size(); g++) {
      if (matches(grid.groups[g].id, change.groupId)) {
        named += cellsInRow(grid, g, change);
      }
    }
    return named;
  }

  private static Integer cellsInRow(
    ScheduleGrid grid,
    Integer g,
    GeneratedWeek.LockChange change
  ) {
    Integer named = 0;
    List<String> slots = SlotIds.ofRow(grid, g);
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      if (matches(grid.blocks[b].id, change.blockId)) {
        named++;
        if (changes(slots[b], change)) {
          setPlacement(grid, new List<Integer>{ g, b }, change);
        }
      }
    }
    return named;
  }

  /**
   * Whether the change reaches this cell. Never a fixed or recurring activity. The shortcuts (a
   * day, a group, a group's day) lock only cells that hold something: locking an Open or
   * not-at-camp cell would keep it empty through every build, unseen, so keeping a cell empty is
   * always a Lock on that one cell. Unlock reaches every cell.
   */
  private static Boolean changes(String slot, GeneratedWeek.LockChange change) {
    Boolean oneCell = String.isNotBlank(change.blockId);
    return !SlotIds.isSetTime(slot) &&
      (oneCell ||
      !change.locks() ||
      slot != SlotIds.OPEN);
  }

  /** Whether a record Id is the one named (any, when none is named). */
  private static Boolean matches(String recordId, String named) {
    return String.isBlank(named) ||
      SlotIds.indexOf(new List<String>{ recordId }, named) == 0;
  }

  /** The cell and the rest of its placement: the blocks it carries on from and into. */
  private static void setPlacement(
    ScheduleGrid grid,
    List<Integer> cell,
    GeneratedWeek.LockChange change
  ) {
    for (Integer b : placementOf(grid, cell)) {
      List<Integer> each = new List<Integer>{ cell[0], b };
      if (change.locks()) {
        ScheduleGridLocks.lock(grid, each);
      } else {
        ScheduleGridLocks.unlock(grid, each);
      }
    }
  }

  /**
   * A hand edit on Generated Schedule changed this cell: the placement it now belongs to is
   * locked when it holds something, unlocked when Open. Fixed and recurring activities always
   * stay where setup puts them, so they are never locked.
   */
  public static void lockIfFilled(ScheduleGrid grid, List<Integer> cell) {
    String slot = SlotIds.ofRow(grid, cell[0])[cell[1]];
    if (SlotIds.isSetTime(slot)) {
      return;
    }
    for (Integer b : placementOf(grid, cell)) {
      List<Integer> each = new List<Integer>{ cell[0], b };
      if (slot == SlotIds.OPEN) {
        ScheduleGridLocks.unlock(grid, each);
      } else {
        ScheduleGridLocks.lock(grid, each);
      }
    }
  }

  /**
   * Every placed cell of these days locked, as a hand edit locks it (lockIfFilled): Open cells
   * stay unlocked, so a Rebuild fills around the rest; fixed and recurring activities are never
   * locked. A Manual Build version restored on Generated Schedule (ManualVersions).
   */
  public static void lockPlaced(List<ScheduleDays.DayGrid> days) {
    for (ScheduleDays.DayGrid day : days) {
      for (Integer g = 0; g < day.grid.rows.size(); g++) {
        for (Integer b = 0; b < day.grid.rows[g].size(); b++) {
          lockIfFilled(day.grid, new List<Integer>{ g, b });
        }
      }
      ScheduleGridLocks.tidy(day.grid);
    }
  }

  /** The time block positions of the cell's placement: the blocks it carries on from and into. */
  public static List<Integer> placementOf(
    ScheduleGrid grid,
    List<Integer> cell
  ) {
    List<String> row = grid.rows[cell[0]];
    Integer first = cell[1];
    while (first > 0 && row[first] == ScheduleGrid.CARRIES_ON) {
      first--;
    }
    List<Integer> result = new List<Integer>{ first };
    for (
      Integer b = first + 1;
      b < row.size() &&
      row[b] == ScheduleGrid.CARRIES_ON;
      b++
    ) {
      result.add(b);
    }
    return result;
  }

  /** The locked cells of grids saved for these days (in the days' order). */
  public static List<GeneratedWeek.Cell> lockedIn(
    List<ScheduleDays.DayGrid> days,
    List<ScheduleGrid> grids
  ) {
    List<GeneratedWeek.Cell> cells = new List<GeneratedWeek.Cell>();
    for (Integer d = 0; d < days.size(); d++) {
      ScheduleGrid grid = grids[d];
      for (Integer g = 0; g < grid.locks.size(); g++) {
        for (Integer b = 0; b < grid.locks[g].size(); b++) {
          if (ScheduleGridLocks.isLocked(grid, g, b)) {
            GeneratedWeek.Cell cell = new GeneratedWeek.Cell();
            cell.dateValue = days[d].day;
            cell.groupId = grid.groups[g].id;
            cell.blockId = grid.blocks[b].id;
            cells.add(cell);
          }
        }
      }
    }
    return cells;
  }
}
