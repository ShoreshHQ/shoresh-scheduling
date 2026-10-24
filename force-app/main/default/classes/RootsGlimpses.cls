/**
 * Roots' schedule glimpses (repo ADR 0020): one day of the shown week's first Generated and first
 * Manual draft (programs in order), its first groups across and time blocks down. A picture, not
 * the schedule. One query. Runs in user mode.
 */
public with sharing class RootsGlimpses {
  @TestVisible
  private static final Integer GLIMPSE_GROUPS = 6;
  @TestVisible
  private static final Integer GLIMPSE_BLOCKS = 8;
  private static final String GENERATED = 'Generated';
  private static final String MANUAL = 'Manual';
  private static final String FIXED_KIND = 'F';

  /** Fills the table's two glimpses from the season's drafts and published schedules. */
  public static void read(
    RootsTable.Table result,
    List<Schedule__c> schedules
  ) {
    Id generatedId = firstDraft(result.shownWeekId, schedules, GENERATED);
    Id manualId = firstDraft(result.shownWeekId, schedules, MANUAL);
    if (generatedId == null && manualId == null) {
      return;
    }
    Map<Id, Map<Date, List<ScheduleDay__c>>> days = firstDays(
      new Set<Id>{ generatedId, manualId }
    );
    result.generated = glimpseOf(days.get(generatedId));
    result.manual = glimpseOf(days.get(manualId));
  }

  private static Id firstDraft(
    Id weekId,
    List<Schedule__c> schedules,
    String origin
  ) {
    for (Schedule__c schedule : schedules) {
      if (
        schedule.Week__c == weekId &&
        schedule.Status__c == RootsTable.DRAFT &&
        schedule.Origin__c == origin
      ) {
        return schedule.Id;
      }
    }
    return null;
  }

  /** Each schedule's first day, its parts in order. */
  private static Map<Id, Map<Date, List<ScheduleDay__c>>> firstDays(
    Set<Id> scheduleIds
  ) {
    Map<Id, Map<Date, List<ScheduleDay__c>>> result = new Map<Id, Map<Date, List<ScheduleDay__c>>>();
    for (ScheduleDay__c part : [
      SELECT
        Schedule__c,
        Date__c,
        Part__c,
        Grid__c,
        GridFormatVersion__c,
        Revision__c
      FROM ScheduleDay__c
      WHERE Schedule__c IN :scheduleIds
      WITH USER_MODE
      ORDER BY Date__c, Part__c
    ]) {
      if (!result.containsKey(part.Schedule__c)) {
        result.put(
          part.Schedule__c,
          new Map<Date, List<ScheduleDay__c>>{
            part.Date__c => new List<ScheduleDay__c>()
          }
        );
      }
      List<ScheduleDay__c> parts = result.get(part.Schedule__c)
        .get(part.Date__c);
      if (parts != null) {
        parts.add(part);
      }
    }
    return result;
  }

  private static RootsTable.Glimpse glimpseOf(
    Map<Date, List<ScheduleDay__c>> days
  ) {
    if (days == null || days.isEmpty()) {
      return null;
    }
    Date first = new List<Date>(days.keySet())[0];
    ScheduleDays.DayGrid day = ScheduleDays.readDay(first, days.get(first));
    // A day that can't be read is not drawn; its own screen says why.
    return day.grid == null ? null : glimpseOf(day.grid);
  }

  @TestVisible
  private static RootsTable.Glimpse glimpseOf(ScheduleGrid grid) {
    RootsTable.Glimpse glimpse = new RootsTable.Glimpse();
    Integer groupCount = Math.min(grid.groups.size(), GLIMPSE_GROUPS);
    Integer blockCount = Math.min(grid.blocks.size(), GLIMPSE_BLOCKS);
    for (Integer g = 0; g < groupCount; g++) {
      glimpse.groups.add(grid.groups[g].name);
    }
    for (Integer b = 0; b < blockCount; b++) {
      glimpse.rows.add(rowOf(grid, b, groupCount));
    }
    return glimpse;
  }

  /** One time block across the groups; the fixed activity when every group has the same one. */
  private static RootsTable.Row rowOf(
    ScheduleGrid grid,
    Integer b,
    Integer groupCount
  ) {
    RootsTable.Row row = new RootsTable.Row();
    row.startTime = grid.blocks[b].startTime;
    Set<String> fixedNames = new Set<String>();
    Integer fixedCells = 0;
    for (Integer g = 0; g < groupCount; g++) {
      ScheduleGrid.Item item = itemAt(grid, g, b);
      RootsTable.Cell cell = new RootsTable.Cell();
      cell.name = item == null ? '' : item.name;
      cell.locked = ScheduleGridLocks.isLocked(grid, g, b);
      row.cells.add(cell);
      if (item != null && item.kind == FIXED_KIND) {
        fixedNames.add(item.name);
        fixedCells++;
      }
    }
    if (groupCount > 0 && fixedCells == groupCount && fixedNames.size() == 1) {
      row.fixed = new List<String>(fixedNames)[0];
    }
    return row;
  }

  /** The item in a cell, following "carries on" up to where it started; null when empty. */
  private static ScheduleGrid.Item itemAt(
    ScheduleGrid grid,
    Integer g,
    Integer b
  ) {
    Integer at = b;
    while (at > 0 && grid.rows[g][at] == ScheduleGrid.CARRIES_ON) {
      at--;
    }
    String cell = grid.rows[g][at];
    if (String.isBlank(cell) || cell == ScheduleGrid.CARRIES_ON) {
      return null;
    }
    return grid.items[Integer.valueOf(cell) - 1];
  }
}
