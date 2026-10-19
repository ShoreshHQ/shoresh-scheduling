/**
 * What each cell of a day holds, for comparing a published day with a draft (PublishedChanges):
 * the item placed there (its kind, record and name), a block an activity carries on into
 * included, keyed "groupId|blockId". Nothing placed is Open.
 */
public with sharing class PublishedCells {
  public static final String OPEN = 'Open';

  /** What is placed in a cell: its kind, record and name. */
  public class Item {
    private String key;
    private String name;

    private Item(ScheduleGrid.Item item) {
      // The name too: an activity renamed since it was published is a change to publish.
      this.key =
        item.kind +
        '|' +
        (item.id == null ? '' : item.id) +
        '|' +
        item.name;
      this.name = item.name;
    }
  }

  public static Boolean same(Item a, Item b) {
    if (a == null || b == null) {
      return a == b;
    }
    // Exactly: Apex's == ignores case, and a name's case is part of what campers read.
    return a.key.equals(b.key);
  }

  public static String nameOf(Item item) {
    return item == null ? OPEN : item.name;
  }

  /** Each filled cell ("groupId|blockId"), a block an activity carries on into included. */
  public static Map<String, Item> of(ScheduleGrid grid) {
    Map<String, Item> result = new Map<String, Item>();
    if (grid == null) {
      return result;
    }
    for (Integer g = 0; g < grid.groups.size(); g++) {
      addRow(grid, g, result);
    }
    return result;
  }

  private static void addRow(
    ScheduleGrid grid,
    Integer g,
    Map<String, Item> result
  ) {
    List<String> row = grid.rows[g];
    Item current = null;
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      String cell = b < row.size() ? row[b] : '';
      // '^': the item before carries on (the grid rules refuse ^ after an empty cell).
      if (cell != ScheduleGrid.CARRIES_ON) {
        current = String.isBlank(cell)
          ? null
          : new Item(grid.items[Integer.valueOf(cell) - 1]);
      }
      if (current != null) {
        result.put(grid.groups[g].id + '|' + grid.blocks[b].id, current);
      }
    }
  }
}
