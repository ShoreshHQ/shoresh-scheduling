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
    ScheduleDays.DayGrid read = new ScheduleDays.DayGrid();
    read.day = SpecialSchedule.PLAN_DAY;
    read.grid = grid;
    read.problem = problem;
    return ofAll(
      new List<ScheduleDays.DayGrid>{ read },
      new List<Boolean>{ owner.isEvent() }
    )[0];
  }

  /**
   * Several plans at once, each as its day (plan.day its date), with one look-up for all of them
   * (ADR 0014 slice 5: a week's special days and events). isEvent: for each plan, whether it is
   * an event's (its columns are stations, never gone).
   */
  public static List<ScheduleViews.DayView> ofAll(
    List<ScheduleDays.DayGrid> plans,
    List<Boolean> isEvent
  ) {
    List<ScheduleDays.DayGrid> readable = new List<ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid plan : plans) {
      if (plan.grid != null) {
        readable.add(plan);
      }
    }
    Set<String> there = readable.isEmpty()
      ? new Set<String>()
      : ScheduleRefs.stillThere(readable);
    List<ScheduleViews.DayView> result = new List<ScheduleViews.DayView>();
    for (Integer i = 0; i < plans.size(); i++) {
      result.add(build(plans[i], isEvent[i], there));
    }
    return result;
  }

  private static ScheduleViews.DayView build(
    ScheduleDays.DayGrid plan,
    Boolean isEvent,
    Set<String> there
  ) {
    ScheduleViews.DayView day = new ScheduleViews.DayView();
    day.dateValue = plan.day;
    day.problem = plan.problem;
    ScheduleGrid grid = plan.grid;
    if (grid == null) {
      return day;
    }
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
        ScheduleGridRules.isSetUp(item) && !ScheduleRefs.isThere(item.id, there)
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
