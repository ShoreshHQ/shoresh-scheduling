/**
 * What the server checks when a generated week is saved (GeneratedSaves). The engine runs in the
 * browser (ADR 0010), so the server re-checks what it cheaply can and refuses an impossible write:
 * fixed and recurring activities stay where they are; nothing is put where a group isn't at camp
 * (a leftover there may be cleared); only this season's activities are placed; something not set
 * up yet is kept, never newly placed. Rule bends (over a weekly limit and the rest) are allowed:
 * the engine marks them. The checks are Manual Build's own (SlotRules), on the cells that
 * changed. That the days are the draft's own is GeneratedFrames. Reads in user mode.
 */
public with sharing class GeneratedChecks {
  private SlotRules rules;

  private GeneratedChecks(SlotRules rules) {
    this.rules = rules;
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
    Map<Date, GeneratedWeek.Day> byDate = GeneratedFrames.byDate(sent);
    GeneratedChecks checks = new GeneratedChecks(
      new SlotRules(program, activityIds(sent))
    );
    List<ScheduleGrid> grids = new List<ScheduleGrid>();
    for (ScheduleDays.DayGrid day : days) {
      ScheduleGrid now = built(day.grid, byDate.get(day.day));
      checks.name(day.grid, now);
      for (Integer g = 0; g < now.groups.size(); g++) {
        checks.checkRow(SlotIds.ofRow(day.grid, g), now, g);
      }
      grids.add(now);
    }
    return grids;
  }

  private static Set<Id> activityIds(List<GeneratedWeek.Day> sent) {
    Set<Id> result = new Set<Id>();
    for (GeneratedWeek.Day day : sent) {
      for (GeneratedWeek.Item item : items(day)) {
        if (item?.kind == 'A') {
          result.add(SlotIds.activityIn('A:' + item.id));
        }
      }
    }
    result.remove(null);
    return result;
  }

  private static List<GeneratedWeek.Item> items(GeneratedWeek.Day day) {
    return day.items == null ? new List<GeneratedWeek.Item>() : day.items;
  }

  /** The day's frame (time blocks and groups as saved) with the items and rows sent. */
  private static ScheduleGrid built(
    ScheduleGrid before,
    GeneratedWeek.Day sent
  ) {
    ScheduleGrid grid = new ScheduleGrid();
    grid.blocks = before.blocks;
    grid.groups = before.groups;
    for (GeneratedWeek.Item item : items(sent)) {
      if (item == null) {
        throw GeneratedFrames.unreadable();
      }
      grid.items.add(new ScheduleGrid.Item(item.kind, item.id, item.name));
    }
    for (String row : sent.rows == null ? new List<String>() : sent.rows) {
      grid.rows.add((row ?? '').split(',', -1));
    }
    try {
      ScheduleGridRules.check(grid);
    } catch (ScheduleGridRules.GridException e) {
      throw new ShoreshException(
        'That change could not be read: ' +
          e.getMessage() +
          '. Reload the page and try again.'
      );
    }
    grid.dropUnusedItems();
    return grid;
  }

  /**
   * Names are never taken from the screen: an activity has its name in setup now (as Manual
   * Build shows it), anything else the name it was saved with.
   */
  private void name(ScheduleGrid before, ScheduleGrid now) {
    Map<String, String> savedNames = new Map<String, String>();
    for (ScheduleGrid.Item item : before.items) {
      savedNames.put(SlotIds.of(item), item.name);
    }
    for (ScheduleGrid.Item item : now.items) {
      String identity = SlotIds.of(item);
      Activity__c activity = rules.activityOf(identity);
      if (activity != null) {
        item.name = activity.Name;
      } else if (savedNames.containsKey(identity)) {
        item.name = savedNames.get(identity);
      }
    }
  }

  /** Every cell of a group's row that changed must be one the rules allow. */
  private void checkRow(List<String> was, ScheduleGrid now, Integer g) {
    List<String> slots = SlotIds.ofRow(now, g);
    for (Integer b = 0; b < slots.size(); b++) {
      if (!slots[b].equals(was[b])) {
        checkCell(
          was[b],
          slots[b],
          new List<String>{ now.groups[g].id, now.blocks[b].id }
        );
      }
    }
  }

  /** at: the cell's group and time block Ids. */
  private void checkCell(String was, String slot, List<String> at) {
    rules.checkNotSetTime(was, slot);
    rules.checkAtCamp(slot, at[0], at[1]);
    if (slot == SlotIds.OPEN) {
      return;
    }
    // Something not set up yet (an elective, a trip) can be kept, never newly placed.
    if (!SlotIds.owner(slot).startsWith('A:')) {
      throw GeneratedFrames.unreadable();
    }
    rules.seasonActivity(slot);
  }
}
