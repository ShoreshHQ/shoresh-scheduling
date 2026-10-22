/**
 * A day as the engine built it, turned into the grid the server stores (GeneratedSaves): the
 * day's own frame as saved (time blocks and groups), with the items and rows sent, stored one way.
 */
public with sharing class GeneratedGrids {
  /** The day's frame with the items and rows sent. Refuses a grid that can't be read. */
  public static ScheduleGrid of(ScheduleGrid before, GeneratedWeek.Day sent) {
    ScheduleGrid grid = new ScheduleGrid();
    grid.blocks = before.blocks;
    grid.groups = before.groups;
    for (GeneratedWeek.Item item : items(sent)) {
      if (item == null) {
        throw GeneratedFrames.unreadable();
      }
      grid.items.add(new ScheduleGrid.Item(item.kind, item.id, item.name));
    }
    for (String row : sent.rows == null ? new List<String>() : sent.rows) {
      grid.rows.add((row ?? '').split(',', -1));
    }
    try {
      ScheduleGridRules.check(grid);
    } catch (ScheduleGridRules.GridException e) {
      // Only a screen bug sends a broken grid; its details mean nothing to a camp.
      throw GeneratedFrames.unreadable();
    }
    tidy(grid);
    grid.dropUnusedItems();
    return grid;
  }

  public static List<GeneratedWeek.Item> items(GeneratedWeek.Day day) {
    return day.items == null ? new List<GeneratedWeek.Item>() : day.items;
  }

  /** Stored the one way: '' for Open, item numbers without leading zeros, 18-character Ids. */
  private static void tidy(ScheduleGrid grid) {
    for (List<String> row : grid.rows) {
      for (Integer b = 0; b < row.size(); b++) {
        row[b] = String.isBlank(row[b]) || row[b] == ScheduleGrid.CARRIES_ON
          ? row[b].trim()
          : String.valueOf(Integer.valueOf(row[b].trim()));
      }
    }
    for (ScheduleGrid.Item item : grid.items) {
      item.id = ScheduleGridRules.isSetUp(item) ? fullId(item.id) : item.id;
    }
  }

  private static String fullId(String recordId) {
    try {
      return String.valueOf(Id.valueOf(recordId));
    } catch (StringException e) {
      throw GeneratedFrames.unreadable();
    }
  }
}
