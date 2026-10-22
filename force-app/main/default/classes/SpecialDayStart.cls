/**
 * A new special day's first plan, as SpecialDaySeed reads the camp: the program's time blocks as
 * the day's own (ids of its own, "b1", ADR 0014 choice 6), a row for every group, and each fixed
 * or recurring activity that runs every day its program runs and in every week, in time blocks
 * the day has (matched by name and times), brought into the groups it takes. A morning-only or
 * afternoon-only group takes the part it is there for, as Start a blank week does (BlankDay); a
 * slot already taken is left as it is. Everything left out is named in the seed, with why. What
 * is brought in is an ordinary cell of the day, as on the desktop: the director can type over it
 * in one group (SpecialScheduleEdits), and an import replaces it (SpecialScheduleImport).
 */
public with sharing class SpecialDayStart {
  public final ScheduleGrid grid = new ScheduleGrid();
  public final SpecialDaySeed.Seed seed = new SpecialDaySeed.Seed();
  // A time block's name and times -> its place in the special day.
  private final Map<String, Integer> blockAt = new Map<String, Integer>();
  private final Map<Id, Integer> groupAt = new Map<Id, Integer>();
  // The season's weeks (one stand-in week when it has none, SetTimePlan).
  private Integer seasonWeeks = 0;

  public SpecialDayStart(Program__c program, List<Group__c> groups) {
    seed.program = program.Name;
    for (TimeBlock__c block : program.TimeBlocks__r) {
      String key = keyOf(block);
      if (!blockAt.containsKey(key)) {
        blockAt.put(key, grid.blocks.size());
      }
      grid.blocks.add(
        new ScheduleGrid.Block('b' + (grid.blocks.size() + 1), block.Name)
          .at(
            BlankWeek.clock(block.StartTime__c),
            BlankWeek.clock(block.EndTime__c)
          )
      );
    }
    seed.timeBlocks = grid.blocks.size();
    for (Group__c grp : groups) {
      groupAt.put(grp.Id, grid.groups.size());
      grid.groups.add(new ScheduleGrid.GroupRef(grp.Id, grp.Name));
      grid.rows.add(openRow());
    }
  }

  /** A group's row with every time block open. */
  private List<String> openRow() {
    List<String> row = new List<String>();
    for (ScheduleGrid.Block block : grid.blocks) {
      row.add('');
    }
    return row;
  }

  /** Every fixed and recurring activity of the season, in setup's order. */
  public void bringIn(SetTimePlan plan) {
    seasonWeeks = plan.weekIds.size();
    for (SetTimePlan.Item item : plan.items) {
      List<Integer> span = item.start == null
        ? new List<Integer>()
        : item.span();
      if (span.isEmpty()) {
        continue;
      }
      List<String> leftOut = whyLeftOut(item);
      Map<Integer, Integer> here = placesOf(item, span);
      if (leftOut == null && here == null) {
        leftOut = seed.otherTimes;
      }
      if (leftOut != null) {
        addOnce(leftOut, item.name);
      } else {
        placeInGroups(item, span, here);
      }
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

  /** The seed's list an item is left out in (not every day, not every week), or null. */
  private List<String> whyLeftOut(SetTimePlan.Item item) {
    List<String> runDays = item.runDays();
    if (runDays.isEmpty() || runDays.size() < item.program.days.size()) {
      return seed.notEveryDay;
    }
    return item.weekIds.size() < seasonWeeks ? seed.notEveryWeek : null;
  }

  /** In each group it takes, from the special-day block its first block is (here). */
  private void placeInGroups(
    SetTimePlan.Item item,
    List<Integer> span,
    Map<Integer, Integer> here
  ) {
    String position = null;
    for (Group__c grp : item.program.groups) {
      List<Integer> part = takes(item, grp)
        ? BlankDay.atCampPart(item, grp, span)
        : new List<Integer>();
      if (part.isEmpty()) {
        continue;
      }
      List<String> row = grid.rows[groupAt.get(grp.Id)];
      Integer first = here.get(part[0]);
      if (!free(row, first, part.size())) {
        seed.slotTaken.add(item.name + ' · ' + grp.Name);
        continue;
      }
      position = position == null ? add(item) : position;
      row[first] = position;
      for (Integer b = first + 1; b < first + part.size(); b++) {
        row[b] = ScheduleGrid.CARRIES_ON;
      }
    }
  }

  private Boolean takes(SetTimePlan.Item item, Group__c grp) {
    return item.groupIds.contains(grp.Id) && groupAt.containsKey(grp.Id);
  }

  private String add(SetTimePlan.Item item) {
    grid.items.add(
      new ScheduleGrid.Item(
        item.term == 'FixedActivity' ? 'F' : 'R',
        item.record.Id,
        item.name
      )
    );
    addOnce(seed.broughtIn, item.name);
    return String.valueOf(grid.items.size());
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
