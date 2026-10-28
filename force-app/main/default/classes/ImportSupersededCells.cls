/**
 * An item a second import removes whose only uses are cells in earlier imports' own versions of a
 * week this import brings in again (docs/import/review.md INGEST-5.8; coordinator's decision on
 * Greg's Q3 example, 2026-10-27): the newest imported week is the one that counts (engine
 * protocol 8.9), so those cells are taken out with it, logged for Undo to put back exactly.
 */
public with sharing class ImportSupersededCells {
  /**
   * The versions this import supersedes: an import's own version (not published) of a program
   * and week the plan brings a new imported week for, made before this save.
   */
  public static Set<Id> superseded(ImportPlan plan, ImportWriter writer) {
    Set<String> pairs = new Set<String>();
    for (ImportPlan.Entry entry : plan.entries('versions')) {
      if (entry.has('programKey') && entry.has('weekId')) {
        pairs.add(entry.text('programKey') + '|' + entry.text('weekId'));
      }
    }
    Set<Id> madeNow = writer.createdIds();
    Set<Id> result = new Set<Id>();
    if (pairs.isEmpty()) {
      return result;
    }
    for (Schedule__c schedule : [
      SELECT Id, Program__c, Week__c, Status__c, Origin__c
      FROM Schedule__c
      WHERE Program__r.Season__c = :plan.seasonId
      WITH USER_MODE
    ]) {
      if (
        ImportedWeekGuard.isImported(schedule) &&
        !madeNow.contains(schedule.Id) &&
        pairs.contains(
          String.valueOf(schedule.Program__c) +
            '|' +
            String.valueOf(schedule.Week__c)
        )
      ) {
        result.add(schedule.Id);
      }
    }
    return result;
  }

  /** Takes the items' cells out of those days, logged for Undo (entry `cellsOut`). */
  public static void takeOut(
    Set<Id> dayIds,
    Set<Id> items,
    ImportWriter writer
  ) {
    if (dayIds.isEmpty()) {
      return;
    }
    List<ScheduleDay__c> changed = new List<ScheduleDay__c>();
    for (ScheduleDay__c day : [
      SELECT Id, Grid__c, Schedule__r.Name
      FROM ScheduleDay__c
      WHERE Id IN :dayIds
      WITH USER_MODE
    ]) {
      String after = without(day.Grid__c, items);
      writer.logCellsOut(day, after);
      changed.add(new ScheduleDay__c(Id = day.Id, Grid__c = after));
    }
    ImportedWeekGuard.allow();
    try {
      Database.update(changed, AccessLevel.USER_MODE);
    } finally {
      ImportedWeekGuard.done();
    }
  }

  /** The grid with the items' cells (and the blocks they carry on into) emptied. */
  @TestVisible
  private static String without(String text, Set<Id> items) {
    ScheduleGrid grid = ScheduleGrid.fromText(text);
    Set<String> numbers = numbersOf(grid, items);
    for (List<String> row : grid.rows) {
      Boolean emptied = false;
      for (Integer b = 0; b < row.size(); b++) {
        if (numbers.contains(row[b])) {
          row[b] = '';
          emptied = true;
        } else if (emptied && row[b] == ScheduleGrid.CARRIES_ON) {
          row[b] = '';
        } else {
          emptied = false;
        }
      }
    }
    grid.dropUnusedItems();
    return grid.toText();
  }

  /** The grid's item numbers ("1", "2", ...) of the given items. */
  private static Set<String> numbersOf(ScheduleGrid grid, Set<Id> items) {
    Set<String> wanted = new Set<String>();
    for (Id item : items) {
      wanted.add(String.valueOf(item));
    }
    Set<String> numbers = new Set<String>();
    for (Integer i = 0; i < grid.items.size(); i++) {
      String itemId = grid.items[i].id;
      if (String.isNotBlank(itemId) && wanted.contains(itemId)) {
        numbers.add(String.valueOf(i + 1));
      }
    }
    return numbers;
  }

  /** Undo: puts each day back as it was, unless it was changed since (then kept, named). */
  public static void putBack(List<Object> entries, ImportUndo.Result result) {
    Map<Id, Map<String, Object>> byDay = new Map<Id, Map<String, Object>>();
    for (Object item : entries) {
      Map<String, Object> entry = (Map<String, Object>) item;
      byDay.put((Id) (String) entry.get('cellsOut'), entry);
    }
    if (byDay.isEmpty()) {
      return;
    }
    Set<Id> ids = byDay.keySet();
    List<ScheduleDay__c> rows = new List<ScheduleDay__c>();
    for (ScheduleDay__c day : [
      SELECT Id, Grid__c
      FROM ScheduleDay__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      Map<String, Object> entry = byDay.get(day.Id);
      if (day.Grid__c != (String) entry.get('after')) {
        result.keptEdited.add((String) entry.get('name'));
        continue;
      }
      rows.add(
        new ScheduleDay__c(Id = day.Id, Grid__c = (String) entry.get('before'))
      );
    }
    ImportedWeekGuard.allow();
    try {
      Database.update(rows, AccessLevel.USER_MODE);
    } finally {
      ImportedWeekGuard.done();
    }
    result.restored += rows.size();
  }
}
