/**
 * The compact grid format's rules for a day's time blocks and groups (ScheduleGrid): each points
 * at its record and has a name, and every time is "HH:mm". The rest is ScheduleGridRules.
 */
public with sharing class ScheduleGridFrameRules {
  private static final Pattern CLOCK = Pattern.compile(
    '([01][0-9]|2[0-3]):[0-5][0-9]'
  );

  public static void check(ScheduleGrid grid) {
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      checkBlock(grid.blocks[b], b + 1);
    }
    for (Integer g = 0; g < grid.groups.size(); g++) {
      if (!isNamedRecord(grid.groups[g].id, grid.groups[g].name)) {
        throw new ScheduleGridRules.GridException(
          'group ' + (g + 1) + ' is missing or has no name'
        );
      }
    }
  }

  /**
   * A stored row's cells. With no time blocks a row has none (a special day's or event's plan
   * before its first time block, ADR 0014 choice 16), though its text is the same as one cell's.
   */
  public static List<String> cellsOf(String row, Integer blockCount) {
    if (blockCount == 0 && String.isEmpty(row)) {
      return new List<String>();
    }
    return row.split(',', -1);
  }

  private static void checkBlock(ScheduleGrid.Block block, Integer position) {
    if (!isNamedRecord(block.id, block.name)) {
      throw new ScheduleGridRules.GridException(
        'time block ' + position + ' is missing or has no name'
      );
    }
    if (!isClock(block.startTime) || !isClock(block.endTime)) {
      throw new ScheduleGridRules.GridException(
        'time block ' + position + ' has unclear times'
      );
    }
  }

  private static Boolean isNamedRecord(String id, String name) {
    return String.isNotBlank(id) && String.isNotBlank(name);
  }

  private static Boolean isClock(String value) {
    return value != null && CLOCK.matcher(value).matches();
  }
}
