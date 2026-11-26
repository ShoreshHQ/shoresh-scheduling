/**
 * Where an elective set sits in the week, for the linked choices editor's small week (electives
 * slice E8; repo ADR 0018 choice 39; desktop deriveBundlePickerCells.js): every weekday and time
 * block where some working schedule of the season (Manual Build, Generated, Published; never a
 * saved version) holds the set, with the divisions there. A linked choice's periods are a weekday
 * and a time block, the same every week (LinkedChoiceTime__c), so the week shown is every week's
 * at once, as the desktop shows Manual and Generated at once.
 *
 * The days are listed first (their Ids and dates), then their text is read a few at a time
 * (ScheduleDayTexts) and only a day that names the set is read as a grid, so even a long season
 * stays well inside memory. Past the reader's budget, or at a day naming the set that can't be
 * read, the week says it is not complete (CORE-6.19). In user mode: only schedules the director
 * can see.
 */
public with sharing class LinkedChoicePlaces {
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
    reader.read(parts);
    result.complete =
      reader.complete &&
      !reader.unreadable &&
      parts.size() <= rowBudget;
    result.cells = reader.cells();
    return result;
  }

  /** "Tuesday" for a date, whatever the user's language. */
  public static String weekdayOf(Date day) {
    return DAY_NAMES[Math.mod(A_SUNDAY.daysBetween(day), 7)];
  }

  private with sharing class Reader extends ScheduleDayTexts.Reader {
    String setKey;
    Map<Id, Id> divisionOf;
    Map<String, Cell> byKey = new Map<String, Cell>();
    Map<String, Set<Id>> divisionsByKey = new Map<String, Set<Id>>();

    Reader(Id electiveSetId, Map<Id, Id> divisionOf) {
      this.setKey = String.valueOf(electiveSetId);
      this.divisionOf = divisionOf;
    }

    /** A day that names the set, read as a grid. */
    public override void take(List<ScheduleDay__c> parts) {
      if (!ScheduleDayTexts.names(parts, setKey)) {
        return;
      }
      ScheduleDays.DayGrid day = gridOf(parts);
      if (day.grid != null) {
        addCells(day.day, day.grid);
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
          ScheduleGrid.Item item = ScheduleGridCells.itemAt(grid, g, b);
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
