/**
 * Where an elective set sits in the week, for the linked choices editor's small week (electives
 * slice E8; repo ADR 0018 choice 39; desktop deriveBundlePickerCells.js): every weekday and time
 * block where some working schedule of the season (Manual Build, Generated, Published; never a
 * saved version) holds the set, with the divisions there. A linked choice's periods are a weekday
 * and a time block, the same every week (LinkedChoiceTime__c), so the week shown is every week's
 * at once, as the desktop shows Manual and Generated at once.
 *
 * The days are listed first (their Ids only), then their text is read a few at a time and only a
 * day that names the set is read as a grid (ScheduleUses' way), so even a long season stays well
 * inside memory. The number of queries is capped: past it the week says it is not complete.
 * In user mode: only schedules the director can see.
 */
public with sharing class LinkedChoicePlaces {
  // Day parts read at once: 25 at the longest (131,072 characters) is about 3.3 million.
  @TestVisible
  private static Integer partsAtOnce = 25;
  // Queries for the text, after the few that find the season and list the days.
  @TestVisible
  private static Integer queryBudget = 40;
  @TestVisible
  private static Integer rowBudget = 5000;
  // Sunday, 7 January 1900: weekdays are counted from it, the same in every locale.
  private static final Date A_SUNDAY = Date.newInstance(1900, 1, 7);
  private static final List<String> DAY_NAMES = new List<String>{
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  };

  /** The set's places in the week, and whether every schedule could be read. */
  public class Places {
    @AuraEnabled
    public List<Cell> cells = new List<Cell>();
    @AuraEnabled
    public Boolean complete = true;
  }

  /** One weekday and time block holding the set, with the divisions there. */
  public class Cell {
    @AuraEnabled
    public String weekday;
    @AuraEnabled
    public Id blockId;
    @AuraEnabled
    public List<Id> divisionIds = new List<Id>();
  }

  public static Places of(Id electiveSetId) {
    Places result = new Places();
    if (electiveSetId == null) {
      return result;
    }
    List<ElectiveSet__c> found = [
      SELECT Season__c
      FROM ElectiveSet__c
      WHERE Id = :electiveSetId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      return result;
    }
    Id seasonId = found[0].Season__c;
    Map<Id, Id> divisionOf = new Map<Id, Id>();
    for (Group__c grp : [
      SELECT Id, Division__c
      FROM Group__c
      WHERE Division__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      divisionOf.put(grp.Id, grp.Division__c);
    }
    Integer upTo = rowBudget + 1;
    List<ScheduleDay__c> parts = [
      SELECT Id, Schedule__c, Date__c
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Program__r.Season__c = :seasonId
        AND Schedule__r.Status__c != 'Version'
      WITH USER_MODE
      ORDER BY Schedule__c, Date__c, Part__c
      LIMIT :upTo
    ];
    Reader reader = new Reader(electiveSetId, divisionOf);
    result.complete = reader.read(parts) && parts.size() <= rowBudget;
    result.cells = reader.cells();
    return result;
  }

  /** "Tuesday" for a date, whatever the user's language. */
  public static String weekdayOf(Date day) {
    return DAY_NAMES[Math.mod(A_SUNDAY.daysBetween(day), 7)];
  }

  private class Reader {
    String setKey;
    Map<Id, Id> divisionOf;
    Map<String, Cell> byKey = new Map<String, Cell>();
    Map<String, Set<Id>> divisionsByKey = new Map<String, Set<Id>>();

    Reader(Id electiveSetId, Map<Id, Id> divisionOf) {
      this.setKey = String.valueOf(electiveSetId);
      this.divisionOf = divisionOf;
    }

    /** Reads the days a batch at a time (a day's parts together); false when the budget ran out. */
    Boolean read(List<ScheduleDay__c> parts) {
      Integer queries = 0;
      List<Id> batch = new List<Id>();
      for (Integer i = 0; i < parts.size(); i++) {
        batch.add(parts[i].Id);
        // A batch ends only between two days, so a day's parts are always read together.
        Boolean last = i == parts.size() - 1;
        if (
          !last &&
          (batch.size() < partsAtOnce || sameDay(parts[i], parts[i + 1]))
        ) {
          continue;
        }
        if (queries == queryBudget) {
          return false;
        }
        readParts(batch);
        queries++;
        batch.clear();
      }
      return true;
    }

    Boolean sameDay(ScheduleDay__c a, ScheduleDay__c b) {
      return a.Schedule__c == b.Schedule__c && a.Date__c == b.Date__c;
    }

    /** Joins each day's parts read here, and reads the days that name the set. */
    void readParts(List<Id> partIds) {
      Map<String, List<ScheduleDay__c>> byDay = new Map<String, List<ScheduleDay__c>>();
      Set<String> naming = new Set<String>();
      for (ScheduleDay__c part : [
        SELECT
          Schedule__c,
          Date__c,
          Part__c,
          Grid__c,
          GridFormatVersion__c,
          Revision__c
        FROM ScheduleDay__c
        WHERE Id IN :partIds
        WITH USER_MODE
        ORDER BY Schedule__c, Date__c, Part__c
      ]) {
        String key = part.Schedule__c + '|' + String.valueOf(part.Date__c);
        if (!byDay.containsKey(key)) {
          byDay.put(key, new List<ScheduleDay__c>());
        }
        byDay.get(key).add(part);
        if (part.Grid__c != null && part.Grid__c.contains(setKey)) {
          naming.add(key);
        }
      }
      for (String key : naming) {
        List<ScheduleDay__c> dayParts = byDay.get(key);
        ScheduleDays.DayGrid day = ScheduleDays.readDay(
          dayParts[0].Date__c,
          dayParts
        );
        if (day.grid != null) {
          addCells(day.day, day.grid);
        }
      }
    }

    void addCells(Date day, ScheduleGrid grid) {
      String weekday = weekdayOf(day);
      for (Integer g = 0; g < grid.groups.size(); g++) {
        String groupId = grid.groups[g].id;
        Id divisionId = GridItems.isId(groupId)
          ? divisionOf.get(Id.valueOf(groupId))
          : null;
        for (Integer b = 0; b < grid.blocks.size(); b++) {
          ScheduleGrid.Item item = GridItems.itemAt(grid, g, b);
          if (
            item == null ||
            item.kind != ElectiveTimes.ELECTIVE ||
            item.id != setKey ||
            !GridItems.isId(grid.blocks[b].id)
          ) {
            continue;
          }
          add(weekday, Id.valueOf(grid.blocks[b].id), divisionId);
        }
      }
    }

    void add(String weekday, Id blockId, Id divisionId) {
      String key = weekday + '|' + blockId;
      Cell cell = byKey.get(key);
      if (cell == null) {
        cell = new Cell();
        cell.weekday = weekday;
        cell.blockId = blockId;
        byKey.put(key, cell);
        divisionsByKey.put(key, new Set<Id>());
      }
      if (divisionId != null && divisionsByKey.get(key).add(divisionId)) {
        cell.divisionIds.add(divisionId);
      }
    }

    /** The cells, by weekday then time block Id: the screen orders them by the clock. */
    List<Cell> cells() {
      List<String> keys = new List<String>(byKey.keySet());
      keys.sort();
      List<Cell> result = new List<Cell>();
      for (String key : keys) {
        Cell cell = byKey.get(key);
        cell.divisionIds.sort();
        result.add(cell);
      }
      return result;
    }
  }
}
