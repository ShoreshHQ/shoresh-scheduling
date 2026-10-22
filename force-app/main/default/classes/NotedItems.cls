/**
 * What an import noted in a day's grid but didn't set up (ADR 0005 §2, ADR 0006): an item of a
 * kind and name with no record ("not set up yet"). Used by "Set it up" (SpecialSetUp, ADR 0014
 * slice 4) to find a special event's or special day's cells and point them at its record.
 */
public with sharing class NotedItems {
  private String kind;
  private String name;

  /** The noted items of a kind ('S', 'D') with this name, spaces and capitals aside. */
  public NotedItems(String kind, String name) {
    this.kind = kind;
    this.name = loose(name);
  }

  /** Whether the grid has one. */
  public Boolean isIn(ScheduleGrid grid) {
    for (ScheduleGrid.Item item : grid.items) {
      if (isOne(item)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Each one in the grid now points at the record, under its name; when the day already held the
   * record too, its cells use the one item. Returns whether anything changed.
   */
  public Boolean pointAt(ScheduleGrid grid, SObject record) {
    Boolean changed = false;
    for (ScheduleGrid.Item item : grid.items) {
      if (isOne(item)) {
        item.id = record.Id;
        item.name = (String) record.get('Name');
        changed = true;
      }
    }
    if (changed) {
      oneItemEach(grid);
    }
    return changed;
  }

  private Boolean isOne(ScheduleGrid.Item item) {
    return item.kind == kind &&
      String.isBlank(item.id) &&
      loose(item.name) == name;
  }

  /** Cells of the same thing use its first item; items no cell uses go. */
  private static void oneItemEach(ScheduleGrid grid) {
    Map<String, String> firstOf = new Map<String, String>();
    Map<String, String> renumber = new Map<String, String>();
    for (Integer i = 0; i < grid.items.size(); i++) {
      String identity = SlotIds.of(grid.items[i]);
      String position = String.valueOf(i + 1);
      if (firstOf.containsKey(identity)) {
        renumber.put(position, firstOf.get(identity));
      } else {
        firstOf.put(identity, position);
      }
    }
    for (List<String> row : grid.rows) {
      for (Integer b = 0; b < row.size(); b++) {
        row[b] = renumber.containsKey(row[b]) ? renumber.get(row[b]) : row[b];
      }
    }
    grid.dropUnusedItems();
  }

  /** Names compared the way people mean them: spaces and capitals aside. */
  public static String loose(String text) {
    return text == null ? '' : text.deleteWhitespace().toLowerCase();
  }
}
