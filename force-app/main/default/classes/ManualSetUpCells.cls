/**
 * Where setup puts each fixed and recurring activity in a Manual Build week now, as Start a blank
 * week puts them (BlankWeek): the counter leaves these cells out of its total whatever they hold,
 * so a week has one total however its cells change (LOCK-4.10), and Clear day or Clear week puts
 * one back where something was typed over it (LOCK-4.9). Setup that can't make a week yet (no
 * time blocks, no activities) gives none.
 */
public with sharing class ManualSetUpCells {
  /** One cell: "2026-06-29|<group Id>|<block Id>", what setup puts there, and its name. */
  public class Cell {
    @AuraEnabled
    public String key;
    // "F:<Id>" or "R:<Id>" where it starts; "^F:<Id>" in a block it carries on into.
    @AuraEnabled
    public String slot;
    @AuraEnabled
    public String name;
  }

  /**
   * The program's week, on setup already read (a start's, or Manual Build's open, a GeneratedSetup
   * made on what it read) and the program's fixed and recurring activities as fixedOf and
   * recurringOf read them: reads nothing.
   */
  public static List<Cell> of(
    GeneratedSetup setup,
    List<FixedActivity__c> fixed,
    List<RecurringActivity__c> recurring
  ) {
    try {
      return of(
        BlankWeek.build(
          setup,
          SetTimePlanReader.planOf(setup, fixed, recurring)
        )
      );
    } catch (ShoreshException notReady) {
      return new List<Cell>();
    }
  }

  /**
   * The program's fixed activities, with what placing them needs (as SetTimePlanReader reads
   * them, in its order). For a user who can read it all (SetTimeAccess).
   */
  public static List<FixedActivity__c> fixedOf(Id programId) {
    return [
      SELECT
        Id,
        Name,
        Program__c,
        TimeBlock__c,
        Length__c,
        EarlyDay__c,
        EarlyBlocks__c,
        Location__c,
        (SELECT Week__c FROM WeekExceptions__r)
      FROM FixedActivity__c
      WHERE Program__c = :programId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ];
  }

  /** The same for its recurring activities. */
  public static List<RecurringActivity__c> recurringOf(Id programId) {
    return [
      SELECT
        Id,
        Name,
        Program__c,
        TimeBlock__c,
        Length__c,
        Location__c,
        Monday__c,
        Tuesday__c,
        Wednesday__c,
        Thursday__c,
        Friday__c,
        Saturday__c,
        Sunday__c,
        (SELECT Week__c FROM WeekExceptions__r),
        (SELECT Division__c, Group__c FROM Coverages__r)
      FROM RecurringActivity__c
      WHERE Program__c = :programId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ];
  }

  private static List<Cell> of(BlankWeek.Week week) {
    List<Cell> result = new List<Cell>();
    for (ScheduleDaySaves.DaySave day : week.days) {
      for (Integer g = 0; g < day.grid.groups.size(); g++) {
        addRow(result, day, g);
      }
    }
    return result;
  }

  private static void addRow(
    List<Cell> result,
    ScheduleDaySaves.DaySave day,
    Integer g
  ) {
    ScheduleGrid grid = day.grid;
    List<ScheduleGrid.Item> held = ScheduleGridCells.itemsIn(grid, g);
    for (Integer b = 0; b < held.size(); b++) {
      ScheduleGrid.Item item = held[b];
      if (isSetTime(item)) {
        Cell cell = new Cell();
        cell.key =
          String.valueOf(day.day) +
          '|' +
          grid.groups[g].id +
          '|' +
          grid.blocks[b].id;
        cell.slot =
          (ScheduleGridCells.carriesOn(grid, g, b)
            ? ScheduleGrid.CARRIES_ON
            : '') +
          item.kind +
          ':' +
          item.id;
        cell.name = item.name;
        result.add(cell);
      }
    }
  }

  /** A fixed or recurring activity. */
  private static Boolean isSetTime(ScheduleGrid.Item item) {
    return item != null && (item.kind == 'F' || item.kind == 'R');
  }
}
