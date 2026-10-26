/**
 * What the server checks when a generated week is saved (GeneratedSaves). The engine runs in the
 * browser (ADR 0010), so the server re-checks what it cheaply can and refuses an impossible write,
 * on the cells that changed:
 * - fixed and recurring activities stay where they are (Manual Build's SlotRules);
 * - nothing is put where a group isn't at camp (SlotRules: part of day; GeneratedClosures: away
 *   this week); a leftover there may be cleared;
 * - only this season's activities, and none closed this week (GeneratedClosures);
 * - something not set up yet (an elective, a trip) stays where it is, and is never newly placed;
 * - Fill the open cells changes only cells that were Open;
 * - a locked cell is never changed (ScheduleGridLocks): its lock is the director's, and the
 *   server keeps the stored locks whatever the screen sends. Start over clears them all;
 * - Start over leaves no activity on a day it clears (every day but those a special day replaces;
 *   not checked when the special days can't be read): the screen clears every activity and builds
 *   nothing (ADR 0010, Start over).
 * These hold what the engine builds. A hand edit is never refused for them (SlotSaves; Greg,
 * 2026-10-26): it is saved locked, and a locked cell is never a changed cell here, so a save keeps
 * it unchecked, whatever closure, away group or set time it goes against. A cell the director
 * unlocks is the engine's again at the next build, and held to these rules if it changes.
 * Rule bends (over a weekly limit and the rest) are allowed: the engine marks them. That the days
 * are the draft's own is GeneratedFrames; the grids themselves, GeneratedGrids. Reads in user mode.
 */
public with sharing class GeneratedChecks {
  private SlotRules rules;
  private GeneratedClosures closures;
  // Fill the open cells: every filled cell stays as it is.
  private Boolean onlyOpen;
  // Every build but Start over keeps the locks.
  private Boolean keepLocks;
  // The day being checked, as saved.
  private ScheduleDays.DayGrid day;

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
    GeneratedSetup setup,
    List<ScheduleDays.DayGrid> days,
    GeneratedWeek.Save request
  ) {
    Map<Date, GeneratedWeek.Day> byDate = GeneratedFrames.byDate(request.days);
    GeneratedChecks checks = new GeneratedChecks(
      setup.rules(activityIds(request.days)),
      new GeneratedClosures(setup),
      request.action == GeneratedSaves.FILL_OPEN
    );
    checks.keepLocks = request.action != GeneratedSaves.START_OVER;
    // Start over: the days a special day replaces keep what they hold; every other is cleared.
    // Worked out as the screen works them out (WeekSpecials.replacedDates); when special days
    // can't be read, no day can be told apart, so none is checked (never a wrong refusal).
    Set<Date> kept = checks.keepLocks
      ? null
      : WeekSpecials.replacedDates(setup.week);
    List<ScheduleGrid> grids = new List<ScheduleGrid>();
    for (ScheduleDays.DayGrid day : days) {
      ScheduleGrid now = GeneratedGrids.of(day.grid, byDate.get(day.day));
      checks.day = day;
      checks.keepLocksOf(day.grid, now);
      checks.name(day.grid, now);
      for (Integer g = 0; g < now.groups.size(); g++) {
        checks.checkRow(SlotIds.ofRow(day.grid, g), now, g);
      }
      if (kept != null && !kept.contains(day.day)) {
        checkCleared(now);
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

  /**
   * Start over clears every activity of the day and places nothing (the screen's clearedDays):
   * an activity still on it, kept or new, is a save the screen didn't make, refused. What else
   * a day holds (fixed and recurring activities, specials, electives) stays as it was, and is
   * checked as any changed cell is.
   */
  private static void checkCleared(ScheduleGrid now) {
    for (Integer g = 0; g < now.groups.size(); g++) {
      for (String slot : SlotIds.ofRow(now, g)) {
        if (SlotIds.owner(slot).startsWith('A:')) {
          throw GeneratedFrames.unreadable();
        }
      }
    }
  }

  /** The stored locks, never the screen's: kept, or all cleared by Start over. */
  private void keepLocksOf(ScheduleGrid before, ScheduleGrid now) {
    List<List<String>> stored = keepLocks
      ? before.locks
      : new List<List<String>>();
    now.locks = new List<List<String>>();
    for (List<String> row : stored) {
      now.locks.add(new List<String>(row));
    }
  }

  /** Every cell of a group's row that changed must be one the rules allow. */
  private void checkRow(List<String> was, ScheduleGrid now, Integer g) {
    List<String> slots = SlotIds.ofRow(now, g);
    for (Integer b = 0; b < slots.size(); b++) {
      if (!slots[b].equals(was[b])) {
        checkNotLocked(now, g, b);
        checkCell(
          was[b],
          slots[b],
          new List<String>{ now.groups[g].id, now.blocks[b].id }
        );
      }
    }
  }

  /** A locked cell keeps what it holds (Bunk 1 · Monday · Period 2 is locked.). */
  private void checkNotLocked(ScheduleGrid now, Integer g, Integer b) {
    if (keepLocks && ScheduleGridLocks.isLocked(day.grid, g, b)) {
      throw new ShoreshException(
        now.groups[g].name +
          ' · ' +
          BlankWeek.weekdayOf(day.day) +
          ' · ' +
          now.blocks[b].name +
          ' is locked.'
      );
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

  /**
   * An elective, trip, special day or event from an import stays where it is (ADR 0010 §3), and
   * so does a special event or elective set placed by hand (ADR 0014 slice 4, ADR 0018 slice E5):
   * named as the day saved it, never by its record Id.
   */
  private void checkNotSetUpKept(String was) {
    String owner = SlotIds.owner(was);
    if (
      ScheduleGridRules.NOT_SET_UP_KINDS.contains(owner.substringBefore(':'))
    ) {
      throw new ShoreshException(savedName(owner) + ' stays where it is.');
    }
  }

  /** What the day as saved calls an item, by its identity. */
  private String savedName(String owner) {
    for (ScheduleGrid.Item item : day.grid.items) {
      if (SlotIds.of(item) == owner) {
        return item.name;
      }
    }
    return owner.substringAfter(':');
  }
}
