/**
 * Locks in a day's grid (grid format version 2, ADR 0010 G4): a locked cell keeps what it holds
 * when the week is generated again (Rebuild, Try another, Fill the open cells); Start over clears
 * them. Stored as ScheduleGrid.locks, one row per group in the order of its rows, one cell per
 * time block: '1' locked, '' not. A grid with no lock is stored as version 1, exactly as before,
 * so the same day always gives the same text.
 */
public with sharing class ScheduleGridLocks {
  public static final String LOCKED = '1';
  // The format a grid is stored in: 2 only when it has a lock.
  public static final Integer WITH_LOCKS = 2;
  public static final Set<Integer> READABLE = new Set<Integer>{
    ScheduleGrid.FORMAT_VERSION,
    WITH_LOCKS
  };

  public static Boolean isLocked(ScheduleGrid grid, Integer g, Integer b) {
    return !grid.locks.isEmpty() && grid.locks[g][b] == LOCKED;
  }

  /** Locks one cell (cell: group and time block positions), giving the grid lock rows. */
  public static void lock(ScheduleGrid grid, List<Integer> cell) {
    withRows(grid);
    grid.locks[cell[0]][cell[1]] = LOCKED;
  }

  /** Gives a grid with no lock rows an empty one per group (nothing locked). */
  public static void withRows(ScheduleGrid grid) {
    if (!grid.locks.isEmpty()) {
      return;
    }
    for (List<String> row : grid.rows) {
      grid.locks.add(emptyRow(row.size()));
    }
  }

  public static void unlock(ScheduleGrid grid, List<Integer> cell) {
    if (!grid.locks.isEmpty()) {
      grid.locks[cell[0]][cell[1]] = '';
    }
  }

  private static List<String> emptyRow(Integer size) {
    List<String> none = new List<String>();
    for (Integer b = 0; b < size; b++) {
      none.add('');
    }
    return none;
  }

  /** Writes the lock rows ("l"), only when a cell is locked. */
  public static void write(JSONGenerator out, ScheduleGrid grid) {
    if (!hasAny(grid)) {
      return;
    }
    out.writeFieldName('l');
    out.writeStartArray();
    for (List<String> row : grid.locks) {
      out.writeString(String.join(row, ','));
    }
    out.writeEndArray();
  }

  /** Reads the lock rows, if the stored text has them. */
  public static void read(Object raw, ScheduleGrid grid) {
    if (raw == null) {
      return;
    }
    if (!(raw instanceof List<Object>)) {
      throw new ScheduleGridRules.GridException('its locks can\'t be read');
    }
    for (Object row : (List<Object>) raw) {
      grid.locks.add(String.valueOf(row).split(',', -1));
    }
  }

  public static Boolean hasAny(ScheduleGrid grid) {
    for (List<String> row : grid.locks) {
      if (row.contains(LOCKED)) {
        return true;
      }
    }
    return false;
  }

  /** The format version the grid is stored in. */
  public static Integer formatOf(ScheduleGrid grid) {
    return hasAny(grid) ? WITH_LOCKS : ScheduleGrid.FORMAT_VERSION;
  }

  /** No lock rows when nothing is locked, so an unlocked day is stored as version 1. */
  public static void tidy(ScheduleGrid grid) {
    if (!hasAny(grid)) {
      grid.locks.clear();
    }
  }

  /** The lock rows, when there are any: one per group, one cell per time block, '1' or ''. */
  public static void check(ScheduleGrid grid) {
    if (grid.locks.isEmpty()) {
      return;
    }
    if (grid.locks.size() != grid.rows.size()) {
      throw new ScheduleGridRules.GridException(
        'its locks do not match its groups'
      );
    }
    for (List<String> row : grid.locks) {
      checkRow(row, grid.blocks.size());
    }
  }

  private static void checkRow(List<String> row, Integer blockCount) {
    if (row.size() != blockCount) {
      throw new ScheduleGridRules.GridException(
        'its locks do not match its time blocks'
      );
    }
    for (String cell : row) {
      if (cell != LOCKED && cell != '') {
        throw new ScheduleGridRules.GridException('it has an unclear lock');
      }
    }
  }
}
