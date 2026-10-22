/**
 * A new special day starts from the camp's regular day (ADR 0014 choice 12; desktop
 * SpecialEventsScreen.jsx and specialDay/copyCampTimeBlocks.js, "seeded from time blocks" and
 * "bring recurring events in"): the time blocks of the first program that has any become the
 * special day's own, every group in the camp is a row, and each fixed or recurring activity that
 * falls the same way on every day is brought into the groups it takes (SpecialDayStart). Anything
 * that differs by day or week, or starts in time blocks this day doesn't have, is left out and
 * named, never guessed at. The same setup always gives the same plan.
 *
 * Setup is read in user mode; where fixed and recurring activities fall is slice 3b's
 * SetTimePlan, read only when the user may read everything it reads (SetTimeAccess), as Manual
 * Build's Start a blank week does. Without that access the day starts with its time blocks only.
 */
public with sharing class SpecialDaySeed {
  /** What the new special day started from, for the screen to say. */
  public class Seed {
    /** The program whose time blocks it took; null when no program has any. */
    @AuraEnabled
    public String program;
    @AuraEnabled
    public Integer timeBlocks = 0;
    /** Brought in, each name once, in setup's order. */
    @AuraEnabled
    public List<String> broughtIn = new List<String>();
    /** Left out: they don't run every day the program runs. */
    @AuraEnabled
    public List<String> notEveryDay = new List<String>();
    /** Left out: they are off in some week. */
    @AuraEnabled
    public List<String> notEveryWeek = new List<String>();
    /** Left out: another program's, in time blocks this day doesn't have. */
    @AuraEnabled
    public List<String> otherTimes = new List<String>();
    /** Left out for one group, whose slot was already taken: "Rest · Bunk 3". */
    @AuraEnabled
    public List<String> slotTaken = new List<String>();
  }

  /** Saves the special day's first plan and says what it holds. Called once, when it is added. */
  public static Seed seed(Id specialDayId) {
    SpecialDayStart start = startOf(seasonOf(specialDayId));
    if (start == null) {
      return new Seed();
    }
    SpecialPlans.write(specialDayId, start.grid, null);
    return start.seed;
  }

  /**
   * The time blocks a special day of the season starts with, as the setup is now: how an import
   * tells whether the director changed them (SpecialImportFrame). One query.
   */
  public static List<ScheduleGrid.Block> startingBlocks(Id seasonId) {
    Program__c program = firstWithBlocks(seasonId);
    return program == null
      ? new List<ScheduleGrid.Block>()
      : new SpecialDayStart(program, new List<Group__c>()).grid.blocks;
  }

  /**
   * The fixed and recurring activities a special day of the season starts with, as the setup is
   * now: the only ones a cell edit may put back once its plan dropped them (SpecialSetTimes).
   */
  public static Set<Id> broughtInIds(Id seasonId) {
    Set<Id> result = new Set<Id>();
    SpecialDayStart start = startOf(seasonId);
    for (
      ScheduleGrid.Item item : start == null
        ? new List<ScheduleGrid.Item>()
        : start.grid.items
    ) {
      result.add(Id.valueOf(item.id));
    }
    return result;
  }

  /** A new special day's first plan for the season; null when no program has time blocks. */
  private static SpecialDayStart startOf(Id seasonId) {
    Program__c program = firstWithBlocks(seasonId);
    if (program == null) {
      return null;
    }
    SpecialDayStart start = new SpecialDayStart(program, groupsOf(seasonId));
    SetTimePlan plan = setTimePlan(seasonId);
    if (plan != null) {
      start.bringIn(plan);
    }
    return start;
  }

  private static Id seasonOf(Id specialDayId) {
    return [
      SELECT Season__c
      FROM SpecialDay__c
      WHERE Id = :specialDayId
      WITH USER_MODE
    ]
    .Season__c;
  }

  /** The season's first program, in the screens' order, with time blocks that have times. */
  private static Program__c firstWithBlocks(Id seasonId) {
    for (Program__c program : [
      SELECT
        Id,
        Name,
        (
          SELECT Id, Name, StartTime__c, EndTime__c
          FROM TimeBlocks__r
          WHERE StartTime__c != NULL AND EndTime__c != NULL
          ORDER BY StartTime__c, SortOrder__c, Id
        )
      FROM Program__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ]) {
      if (!program.TimeBlocks__r.isEmpty()) {
        return program;
      }
    }
    return null;
  }

  /** Every group in the camp, in the order the screens list them (also SpecialSchedule's rows). */
  public static List<Group__c> groupsOf(Id seasonId) {
    return [
      SELECT Id, Name, Division__c
      FROM Group__c
      WHERE Division__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY
        Division__r.Program__r.SortOrder__c NULLS LAST,
        Division__r.Program__r.Name,
        Division__r.Program__c,
        Division__r.SortOrder__c NULLS LAST,
        Division__r.Name,
        Division__c,
        SortOrder__c NULLS LAST,
        Name,
        Id
    ];
  }

  /** The season's fixed and recurring activities, cell by cell; null when there are none. */
  private static SetTimePlan setTimePlan(Id seasonId) {
    if (!SetTimeAccess.canRead()) {
      return null;
    }
    return SetTimePlanReader.read(new Set<Id>{ seasonId }).get(seasonId);
  }
}
