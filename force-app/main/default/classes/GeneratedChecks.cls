/**
 * What the server checks when a generated week is saved (GeneratedSaves). The engine runs in the
 * browser (ADR 0010), so the server re-checks what it cheaply can and refuses an impossible write,
 * on the cells that changed:
 * - fixed and recurring activities stay where they are (Manual Build's SlotRules);
 * - nothing is put where a group isn't at camp (SlotRules: part of day; GeneratedClosures: away
 *   this week); a leftover there may be cleared;
 * - only this season's activities, and none closed this week (GeneratedClosures);
 * - something not set up yet (an elective, a trip) stays where it is, and is never newly placed;
 * - Fill the open cells changes only cells that were Open.
 * Rule bends (over a weekly limit and the rest) are allowed: the engine marks them. That the days
 * are the draft's own is GeneratedFrames; the grids themselves, GeneratedGrids. Reads in user mode.
 */
public with sharing class GeneratedChecks {
  private SlotRules rules;
  private GeneratedClosures closures;
  // Fill the open cells: every filled cell stays as it is.
  private Boolean onlyOpen;

  private GeneratedChecks(
    SlotRules rules,
    GeneratedClosures closures,
    Boolean onlyOpen
  ) {
    this.rules = rules;
    this.closures = closures;
    this.onlyOpen = onlyOpen;
  }

  /**
   * The grids to save, one per day in the days' order: each day's own frame with the items and
   * rows sent. Refuses the whole week if any cell breaks a rule.
   */
  public static List<ScheduleGrid> check(
    Program__c program,
    List<ScheduleDays.DayGrid> days,
    GeneratedWeek.Save request
  ) {
    Map<Date, GeneratedWeek.Day> byDate = GeneratedFrames.byDate(request.days);
    GeneratedChecks checks = new GeneratedChecks(
      new SlotRules(program, activityIds(request.days)),
      new GeneratedClosures(request.weekId),
      request.action == GeneratedSaves.FILL_OPEN
    );
    List<ScheduleGrid> grids = new List<ScheduleGrid>();
    for (ScheduleDays.DayGrid day : days) {
      ScheduleGrid now = GeneratedGrids.of(day.grid, byDate.get(day.day));
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
      for (GeneratedWeek.Item item : GeneratedGrids.items(day)) {
        if (item?.kind == 'A') {
          result.add(SlotIds.activityIn('A:' + item.id));
        }
      }
    }
    result.remove(null);
    return result;
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
    if (onlyOpen && was != SlotIds.OPEN) {
      throw GeneratedFrames.unreadable();
    }
    checkNotSetUpKept(was);
    rules.checkNotSetTime(was, slot);
    rules.checkAtCamp(slot, at[0], at[1]);
    if (slot == SlotIds.OPEN) {
      return;
    }
    // Something not set up yet is never newly placed.
    if (!SlotIds.owner(slot).startsWith('A:')) {
      throw GeneratedFrames.unreadable();
    }
    closures.check(at[0], rules.seasonActivity(slot));
  }

  /** An elective, trip, special day or event from an import stays where it is (ADR 0010 §3). */
  private static void checkNotSetUpKept(String was) {
    String kind = SlotIds.owner(was).substringBefore(':');
    if (ScheduleGridRules.NOT_SET_UP_KINDS.contains(kind)) {
      throw new ShoreshException(
        SlotIds.owner(was).substringAfter(':') + ' stays where it is.'
      );
    }
  }
}
