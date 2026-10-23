/**
 * The rules of the compact grid format (ScheduleGrid), checked before a day is stored and after
 * it is read, so a broken grid is refused or shown as unreadable, never half shown.
 */
public with sharing class ScheduleGridRules {
  // Kinds that point at a record set up in Shoresh, and kinds noted from an import but not set
  // up in Shoresh yet (elective, special day, special event, trip).
  public static final Set<String> SET_UP_KINDS = new Set<String>{
    'A',
    'F',
    'R'
  };
  public static final Set<String> NOT_SET_UP_KINDS = new Set<String>{
    'E',
    'D',
    'S',
    'T'
  };
  // Kinds that point at a record once one is set up in Shoresh, and are noted by name until then
  // (an import's "not set up yet"): a special event placed on the grid, or set up from a file
  // (ADR 0014 slice 4); a special day set up from a file; an elective set placed on the grid, or
  // bound to an imported cell by name (ADR 0018 slice E5).
  public static final Set<String> SET_UP_LATER_KINDS = new Set<String>{
    'S',
    'D',
    'E'
  };

  private static final Pattern ITEM_NUMBER = Pattern.compile('[0-9]{1,6}');

  /** Whether an item points at a record set up in Shoresh (an activity, a placed special event...). */
  public static Boolean isSetUp(ScheduleGrid.Item item) {
    return SET_UP_KINDS.contains(item.kind) ||
      (SET_UP_LATER_KINDS.contains(item.kind) && String.isNotBlank(item.id));
  }

  /** Why a grid cannot be stored or read, in words that finish "could not be read: ...". */
  public class GridException extends Exception {
  }

  public static void check(ScheduleGrid grid) {
    ScheduleGridFrameRules.check(grid);
    checkItems(grid.items);
    if (grid.rows.size() != grid.groups.size()) {
      throw new GridException(
        'it has ' +
          grid.rows.size() +
          ' rows for ' +
          grid.groups.size() +
          ' groups'
      );
    }
    for (Integer g = 0; g < grid.rows.size(); g++) {
      checkRow(grid, g);
    }
    ScheduleGridLocks.check(grid);
  }

  private static void checkItems(List<ScheduleGrid.Item> items) {
    for (Integer i = 0; i < items.size(); i++) {
      checkItem(items[i], i + 1);
    }
  }

  private static void checkItem(ScheduleGrid.Item item, Integer position) {
    Boolean setUp = SET_UP_KINDS.contains(item.kind);
    if (!setUp && !NOT_SET_UP_KINDS.contains(item.kind)) {
      throw new GridException('item ' + position + ' is of an unknown kind');
    }
    if (setUp && String.isBlank(item.id)) {
      throw new GridException('item ' + position + ' points at nothing');
    }
    if (String.isBlank(item.name)) {
      throw new GridException('item ' + position + ' has no name');
    }
  }

  private static void checkRow(ScheduleGrid grid, Integer g) {
    List<String> row = grid.rows[g];
    if (row.size() != grid.blocks.size()) {
      throw new GridException(
        'row ' + (g + 1) + ' does not have one cell per time block'
      );
    }
    for (Integer b = 0; b < row.size(); b++) {
      checkCell(grid, g, b);
    }
  }

  /** One cell: empty, an item in the list, or carrying on from a filled cell above. */
  private static void checkCell(ScheduleGrid grid, Integer g, Integer b) {
    List<String> row = grid.rows[g];
    Integer rowNumber = g + 1;
    String cell = row[b];
    if (cell == ScheduleGrid.CARRIES_ON) {
      if (b == 0 || String.isBlank(row[b - 1])) {
        throw new GridException(
          'row ' + rowNumber + ' carries on from an empty time block'
        );
      }
    } else if (String.isNotBlank(cell) && !isItem(cell, grid.items.size())) {
      throw new GridException(
        'row ' + rowNumber + ' has a cell that is not in its list'
      );
    }
  }

  private static Boolean isItem(String cell, Integer itemCount) {
    if (!ITEM_NUMBER.matcher(cell).matches()) {
      return false;
    }
    Integer position = Integer.valueOf(cell);
    return position >= 1 && position <= itemCount;
  }
}
