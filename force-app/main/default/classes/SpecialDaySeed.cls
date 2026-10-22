/**
 * A new special day starts from the camp's regular day (ADR 0014 choice 12; desktop
 * SpecialEventsScreen.jsx and specialDay/copyCampTimeBlocks.js, "seeded from time blocks" and
 * "bring recurring events in"): the time blocks of the first program that has any become the
 * special day's own, every group in the camp is a row, and each fixed or recurring activity that
 * falls the same way on every day is brought into the groups it takes. Anything that differs by
 * day or week, or starts in time blocks this day doesn't have, is left out and named, never
 * guessed at. The same setup always gives the same plan.
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

  private final ScheduleGrid grid = new ScheduleGrid();
  private final Seed seed = new Seed();
  // A time block's name and times -> its place in the special day.
  private final Map<String, Integer> blockAt = new Map<String, Integer>();
  private final Map<Id, Integer> groupAt = new Map<Id, Integer>();
  // The season's weeks (one stand-in week when it has none, SetTimePlan).
  private Integer seasonWeeks = 0;

  /** Saves the special day's first plan and says what it holds. Called once, when it is added. */
  public static Seed seed(Id specialDayId) {
    Id seasonId = seasonOf(specialDayId);
    SpecialDaySeed built = new SpecialDaySeed();
    Program__c program = firstWithBlocks(seasonId);
    if (program == null) {
      return built.seed;
    }
    built.seed.program = program.Name;
    built.addBlocks(program.TimeBlocks__r);
    built.addGroups(groupsOf(seasonId));
    SetTimePlan plan = setTimePlan(seasonId);
    if (plan != null) {
      built.seasonWeeks = plan.weekIds.size();
      for (SetTimePlan.Item item : plan.items) {
        built.bringIn(item);
      }
    }
    SpecialPlans.write(specialDayId, built.grid, null);
    return built.seed;
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

  /** Every group in the camp, in the order the screens list them. */
  private static List<Group__c> groupsOf(Id seasonId) {
    return [
      SELECT Id, Name
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

  private void addBlocks(List<TimeBlock__c> blocks) {
    for (TimeBlock__c block : blocks) {
      String key = keyOf(block);
      if (!blockAt.containsKey(key)) {
        blockAt.put(key, grid.blocks.size());
      }
      // The special day's own time blocks: ids of its own, not the program's records.
      grid.blocks.add(
        new ScheduleGrid.Block('b' + (grid.blocks.size() + 1), block.Name)
          .at(
            BlankWeek.clock(block.StartTime__c),
            BlankWeek.clock(block.EndTime__c)
          )
      );
    }
    seed.timeBlocks = grid.blocks.size();
  }

  private void addGroups(List<Group__c> groups) {
    for (Group__c grp : groups) {
      groupAt.put(grp.Id, grid.groups.size());
      grid.groups.add(new ScheduleGrid.GroupRef(grp.Id, grp.Name));
      List<String> row = new List<String>();
      for (ScheduleGrid.Block block : grid.blocks) {
        row.add('');
      }
      grid.rows.add(row);
    }
  }

  /** "Lunch|12:00|12:45": a time block as the special day knows it. */
  private static String keyOf(TimeBlock__c block) {
    return block.Name +
      '|' +
      BlankWeek.clock(block.StartTime__c) +
      '|' +
      BlankWeek.clock(block.EndTime__c);
  }

  /**
   * One fixed or recurring activity: brought into every group it takes when it runs every day
   * its program runs and in every week, in time blocks this day has; otherwise named as left out.
   */
  private void bringIn(SetTimePlan.Item item) {
    List<Integer> span = item.start == null ? new List<Integer>() : item.span();
    if (span.isEmpty()) {
      return;
    }
    List<String> runDays = item.runDays();
    if (runDays.isEmpty() || runDays.size() < item.program.days.size()) {
      addOnce(seed.notEveryDay, item.name);
      return;
    }
    if (item.weekIds.size() < seasonWeeks) {
      addOnce(seed.notEveryWeek, item.name);
      return;
    }
    Map<Integer, Integer> here = placesOf(item, span);
    if (here == null) {
      addOnce(seed.otherTimes, item.name);
      return;
    }
    String position = null;
    for (Group__c grp : item.program.groups) {
      if (!item.groupIds.contains(grp.Id) || !groupAt.containsKey(grp.Id)) {
        continue;
      }
      // A morning-only or afternoon-only group takes the part it is there for (BlankDay).
      List<Integer> part = atCampPart(item, grp, span);
      if (part.isEmpty()) {
        continue;
      }
      List<String> row = grid.rows[groupAt.get(grp.Id)];
      Integer first = here.get(part[0]);
      if (!free(row, first, part.size())) {
        seed.slotTaken.add(item.name + ' · ' + grp.Name);
        continue;
      }
      if (position == null) {
        grid.items.add(
          new ScheduleGrid.Item(
            item.term == 'FixedActivity' ? 'F' : 'R',
            item.record.Id,
            item.name
          )
        );
        position = String.valueOf(grid.items.size());
        addOnce(seed.broughtIn, item.name);
      }
      row[first] = position;
      for (Integer b = first + 1; b < first + part.size(); b++) {
        row[b] = ScheduleGrid.CARRIES_ON;
      }
    }
  }

  /**
   * Where each of the item's time blocks is in the special day, one after another; null when one
   * of them isn't there (another program's time blocks).
   */
  private Map<Integer, Integer> placesOf(
    SetTimePlan.Item item,
    List<Integer> span
  ) {
    Map<Integer, Integer> result = new Map<Integer, Integer>();
    Integer previous = null;
    for (Integer b : span) {
      Integer at = blockAt.get(keyOf(item.program.blocks[b]));
      if (at == null || (previous != null && at != previous + 1)) {
        return null;
      }
      result.put(b, at);
      previous = at;
    }
    return result;
  }

  /** The item's time blocks the group is at camp for: from the first such block, unbroken. */
  private static List<Integer> atCampPart(
    SetTimePlan.Item item,
    Group__c grp,
    List<Integer> span
  ) {
    List<Integer> part = new List<Integer>();
    for (Integer b : span) {
      if (SetTimePlan.atCamp(grp, item.program.blocks[b])) {
        part.add(b);
      } else if (!part.isEmpty()) {
        break;
      }
    }
    return part;
  }

  private static Boolean free(List<String> row, Integer first, Integer length) {
    for (Integer b = first; b < first + length; b++) {
      if (b >= row.size() || String.isNotBlank(row[b])) {
        return false;
      }
    }
    return true;
  }

  private static void addOnce(List<String> names, String name) {
    if (!names.contains(name)) {
      names.add(name);
    }
  }
}
