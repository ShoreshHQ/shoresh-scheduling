/**
 * A fixed or recurring activity moved by hand (SlotSaves) onto a day that doesn't list it: listed
 * there, as another day of the schedule names it (Greg, 2026-10-26: a hand edit may move one).
 * One no day names was not on the screen: refused.
 */
public with sharing class SlotSetTimeItems {
  /** Adds the slot's item to the grid's list when it is set-time and the grid lacks it. */
  public static void bring(
    ScheduleGrid grid,
    String slot,
    List<ScheduleDays.DayGrid> days
  ) {
    if (!SlotIds.isSetTime(slot) || itemFor(grid, slot) != null) {
      return;
    }
    for (ScheduleDays.DayGrid day : days) {
      ScheduleGrid.Item item = day.grid == null
        ? null
        : itemFor(day.grid, slot);
      if (item != null) {
        grid.items.add(new ScheduleGrid.Item(item.kind, item.id, item.name));
        return;
      }
    }
    throw new ShoreshException(
      'That change could not be read. Reload the page and try again.'
    );
  }

  private static ScheduleGrid.Item itemFor(ScheduleGrid grid, String slot) {
    for (ScheduleGrid.Item item : grid.items) {
      if (SlotIds.of(item).equals(slot)) {
        return item;
      }
    }
    return null;
  }
}
