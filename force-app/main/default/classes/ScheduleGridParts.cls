/**
 * Splits a day's grid into parts that each fit one ScheduleDay__c record, and joins them back
 * (data model, "Schedules": split rule tested in platform check (d)). A day stays in one part
 * unless its text is over the limit; then it is split into parts of whole groups, in group
 * order, each repeating the day's time blocks and items. Parts are joined in part order.
 */
public with sharing class ScheduleGridParts {
  // Long text holds 131,072 characters; parts stay well under it.
  @TestVisible
  private static Integer partLimit = 100000;

  /** The day's stored text, in parts (usually one). */
  public static List<String> split(ScheduleGrid grid) {
    String whole = grid.toText();
    if (whole.length() <= partLimit) {
      return new List<String>{ whole };
    }
    List<String> parts = new List<String>();
    Integer frameLength = emptyPart(grid).toText().length();
    ScheduleGrid part = emptyPart(grid);
    Integer partLength = frameLength;
    for (Integer g = 0; g < grid.groups.size(); g++) {
      Integer cost = rowLength(grid, g);
      if (frameLength + cost > partLimit) {
        throw new ScheduleGridRules.GridException(
          'one group\'s row alone is too long to store'
        );
      }
      if (partLength + cost > partLimit) {
        parts.add(part.toText());
        part = emptyPart(grid);
        partLength = frameLength;
      }
      part.groups.add(grid.groups[g]);
      part.rows.add(grid.rows[g]);
      partLength += cost;
    }
    parts.add(part.toText());
    return parts;
  }

  /** About how many characters one group adds to a part (a little over, never under). */
  private static Integer rowLength(ScheduleGrid grid, Integer g) {
    ScheduleGrid.GroupRef grp = grid.groups[g];
    return JSON.serialize(new List<String>{ grp.id, grp.name }).length() +
      JSON.serialize(String.join(grid.rows[g], ',')).length() +
      2;
  }

  /** Joins a day's parts, in part order, into one grid. */
  public static ScheduleGrid join(List<String> partTexts) {
    ScheduleGrid whole;
    String frame;
    for (String text : partTexts) {
      ScheduleGrid part = ScheduleGrid.fromText(text);
      String partFrame = emptyPart(part).toText();
      if (whole == null) {
        whole = part;
        frame = partFrame;
      } else if (partFrame != frame) {
        throw new ScheduleGridRules.GridException(
          'its parts do not have the same time blocks and items'
        );
      } else {
        whole.groups.addAll(part.groups);
        whole.rows.addAll(part.rows);
      }
    }
    return whole;
  }

  /** The grid's time blocks and items, with no groups. */
  private static ScheduleGrid emptyPart(ScheduleGrid grid) {
    ScheduleGrid part = new ScheduleGrid();
    part.blocks = grid.blocks;
    part.items = grid.items;
    return part;
  }
}
