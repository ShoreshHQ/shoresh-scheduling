/**
 * Start over, as a generated week's save checks it (GeneratedChecks; ADR 0010, Start over): the
 * screen clears every activity of every day but those a special day replaces, and builds nothing,
 * so an activity still on such a day (kept or new) is a save the screen didn't make, refused. The
 * replaced days are worked out as the screen's are (WeekSpecials.replacedDates); when special days
 * can't be read no day can be told apart, so none is checked (never a wrong refusal).
 */
public with sharing class GeneratedStartOver {
  /** grids: the days to save, in the days' order. */
  public static void check(
    GeneratedSetup setup,
    List<ScheduleDays.DayGrid> days,
    List<ScheduleGrid> grids
  ) {
    Set<Date> kept = WeekSpecials.replacedDates(setup.week);
    if (kept == null) {
      return;
    }
    for (Integer d = 0; d < days.size(); d++) {
      if (!kept.contains(days[d].day)) {
        checkCleared(grids[d]);
      }
    }
  }

  private static void checkCleared(ScheduleGrid now) {
    for (Integer g = 0; g < now.groups.size(); g++) {
      for (String slot : SlotIds.ofRow(now, g)) {
        if (SlotIds.owner(slot).startsWith('A:')) {
          throw GeneratedFrames.unreadable();
        }
      }
    }
  }
}
