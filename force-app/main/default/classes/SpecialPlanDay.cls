/**
 * A special day's or event's plan as a schedule's one day (ScheduleViews.DayView), the shape the
 * week editor draws (ADR 0014 choice 15). Its time blocks and an event's stations are its own and
 * never gone; a special day's groups and every item are looked up (ScheduleRefs), so one deleted
 * since says so. Runs in user mode.
 */
public with sharing class SpecialPlanDay {
  /**
   * The plan as a schedule's day. Its time blocks and an event's stations are its own (never
   * gone); a special day's groups and every item are looked up, so one deleted since says so.
   */
  public static ScheduleViews.DayView of(
    ScheduleGrid grid,
    String problem,
    SpecialSchedule.Owner owner
  ) {
    Boolean isEvent = owner.isEvent();
    ScheduleViews.DayView day = new ScheduleViews.DayView();
    day.dateValue = SpecialSchedule.PLAN_DAY;
    day.problem = problem;
    if (grid == null) {
      return day;
    }
    ScheduleDays.DayGrid read = new ScheduleDays.DayGrid();
    read.day = SpecialSchedule.PLAN_DAY;
    read.grid = grid;
    Set<String> there = ScheduleRefs.stillThere(
      new List<ScheduleDays.DayGrid>{ read }
    );
    for (ScheduleGrid.Block block : grid.blocks) {
      ScheduleViews.Ref ref = ref(block.id, block.name, false);
      ref.startTime = block.startTime;
      ref.endTime = block.endTime;
      day.blocks.add(ref);
    }
    for (ScheduleGrid.GroupRef grp : grid.groups) {
      day.groups.add(
        ref(grp.id, grp.name, !isEvent && !ScheduleRefs.isThere(grp.id, there))
      );
    }
    for (ScheduleGrid.Item item : grid.items) {
      ScheduleViews.Ref ref = ref(
        item.id,
        item.name,
        ScheduleGridRules.SET_UP_KINDS.contains(item.kind) &&
        !ScheduleRefs.isThere(item.id, there)
      );
      ref.kind = item.kind;
      day.items.add(ref);
    }
    for (List<String> cells : grid.rows) {
      day.rows.add(String.join(cells, ','));
    }
    return day;
  }

  private static ScheduleViews.Ref ref(String id, String name, Boolean gone) {
    ScheduleViews.Ref ref = new ScheduleViews.Ref();
    ref.id = id;
    ref.name = name;
    ref.gone = gone;
    return ref;
  }
}
