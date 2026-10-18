/**
 * What the server checks when a generated week is saved (GeneratedSaves). The engine runs in the
 * browser (ADR 0010), so the server re-checks what it cheaply can and refuses an impossible write:
 * every day is one of the draft's, on its own time blocks and groups; fixed and recurring
 * activities stay where they are; nothing is put where a group isn't at camp; only this season's
 * activities are placed. Rule bends (over a weekly limit and the rest) are allowed: the engine
 * marks them. The checks are Manual Build's own (SlotRules), cell by cell, on the cells that
 * changed. Reads in user mode.
 */
public with sharing class GeneratedChecks {
  public static ShoreshException unreadable() {
    return new ShoreshException(
      'That change could not be read. Reload the page and try again.'
    );
  }

  /** Whether the days sent are exactly these days, each on the same time blocks and groups. */
  public static Boolean sameFrame(
    List<ScheduleDays.DayGrid> days,
    List<GeneratedWeek.Day> sent
  ) {
    Map<Date, GeneratedWeek.Day> byDate = byDate(sent);
    if (byDate.size() != days.size()) {
      return false;
    }
    for (ScheduleDays.DayGrid day : days) {
      GeneratedWeek.Day built = byDate.get(day.day);
      if (
        built == null ||
        day.grid == null ||
        !sameIds(day.grid.blockIds(), built.blockIds) ||
        !sameIds(day.grid.groupIds(), built.groupIds)
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * The grids to save, one per day in the days' order: each day's own frame with the items and
   * rows sent. Refuses the whole week if any cell breaks a rule.
   */
  public static List<ScheduleGrid> check(
    Program__c program,
    List<ScheduleDays.DayGrid> days,
    List<GeneratedWeek.Day> sent
  ) {
    Map<Date, GeneratedWeek.Day> byDate = byDate(sent);
    SlotRules rules = new SlotRules(program, activityIds(sent));
    List<ScheduleGrid> grids = new List<ScheduleGrid>();
    for (ScheduleDays.DayGrid day : days) {
      ScheduleGrid now = built(day.grid, byDate.get(day.day), rules);
      for (Integer g = 0; g < now.groups.size(); g++) {
        checkRow(rules, day.grid, now, g);
      }
      grids.add(now);
    }
    return grids;
  }

  private static Map<Date, GeneratedWeek.Day> byDate(
    List<GeneratedWeek.Day> sent
  ) {
    Map<Date, GeneratedWeek.Day> result = new Map<Date, GeneratedWeek.Day>();
    for (GeneratedWeek.Day day : sent) {
      if (day == null || day.dateValue == null) {
        throw unreadable();
      }
      if (result.containsKey(day.dateValue)) {
        throw unreadable();
      }
      result.put(day.dateValue, day);
    }
    return result;
  }

  private static Boolean sameIds(List<String> ids, List<String> sent) {
    return sent != null &&
      ids.size() == sent.size() &&
      SlotIds.sameBlocks(ids, 0, sent);
  }

  private static Set<Id> activityIds(List<GeneratedWeek.Day> sent) {
    Set<Id> result = new Set<Id>();
    for (GeneratedWeek.Day day : sent) {
      for (
        GeneratedWeek.Item item : day.items == null
          ? new List<GeneratedWeek.Item>()
          : day.items
      ) {
        Id activityId = item == null ||
          item.kind != 'A'
          ? null
          : SlotIds.activityIn('A:' + item.id);
        if (activityId != null) {
          result.add(activityId);
        }
      }
    }
    return result;
  }

  /**
   * The day's frame (time blocks and groups as saved) with the items and rows sent. Names are
   * never taken from the screen: an activity has its name in setup now (as Manual Build shows
   * it), anything else the name it was saved with.
   */
  private static ScheduleGrid built(
    ScheduleGrid before,
    GeneratedWeek.Day sent,
    SlotRules rules
  ) {
    ScheduleGrid grid = new ScheduleGrid();
    grid.blocks = before.blocks;
    grid.groups = before.groups;
    for (
      GeneratedWeek.Item item : sent.items == null
        ? new List<GeneratedWeek.Item>()
        : sent.items
    ) {
      if (item == null) {
        throw unreadable();
      }
      grid.items.add(new ScheduleGrid.Item(item.kind, item.id, item.name));
    }
    for (String row : sent.rows == null ? new List<String>() : sent.rows) {
      grid.rows.add((row == null ? '' : row).split(',', -1));
    }
    try {
      ScheduleGridRules.check(grid);
      grid.dropUnusedItems();
    } catch (ScheduleGridRules.GridException e) {
      throw new ShoreshException(
        'That change could not be read: ' +
          e.getMessage() +
          '. Reload the page and try again.'
      );
    }
    Map<String, String> savedNames = new Map<String, String>();
    for (ScheduleGrid.Item item : before.items) {
      savedNames.put(SlotIds.of(item), item.name);
    }
    for (ScheduleGrid.Item item : grid.items) {
      String identity = SlotIds.of(item);
      Activity__c activity = item.kind == 'A'
        ? rules.activityOf(identity)
        : null;
      if (activity != null) {
        item.name = activity.Name;
      } else if (savedNames.containsKey(identity)) {
        item.name = savedNames.get(identity);
      }
    }
    return grid;
  }

  /** Every cell of a group's row that changed must be one the rules allow. */
  private static void checkRow(
    SlotRules rules,
    ScheduleGrid before,
    ScheduleGrid now,
    Integer g
  ) {
    List<String> was = SlotIds.ofRow(before, g);
    List<String> slots = SlotIds.ofRow(now, g);
    for (Integer b = 0; b < slots.size(); b++) {
      if (slots[b].equals(was[b])) {
        continue;
      }
      rules.checkNotSetTime(was[b], slots[b]);
      rules.checkAtCamp(slots[b], now.groups[g].id, now.blocks[b].id);
      if (slots[b] == SlotIds.OPEN) {
        continue;
      }
      // Something not set up yet (an elective, a trip) can be kept, never newly placed.
      if (!SlotIds.owner(slots[b]).startsWith('A:')) {
        throw unreadable();
      }
      rules.seasonActivity(slots[b]);
    }
  }
}
