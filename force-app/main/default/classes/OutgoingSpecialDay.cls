/**
 * A day a special day replaced, going out (API-6.5): its own schedule as published, never the
 * regular cells kept under it, for the published schedule's own groups only. A group with no line
 * in it (no schedule yet, or added to the camp since) goes out as a row naming the special day, so
 * its day isn't left looking free.
 */
public with sharing class OutgoingSpecialDay {
  /** Its things added; refused like any day that can't be read. */
  public static void add(
    ScheduleSpecials.Special special,
    ScheduleDays.DayGrid regular,
    List<OutgoingPublished.Thing> things
  ) {
    if (regular.grid == null || String.isNotBlank(special.problem)) {
      throw new ShoreshException(OutgoingPublished.unreadable(regular.day));
    }
    Set<String> inPlan = new Set<String>();
    if (special.grid != null) {
      ScheduleDays.DayGrid own = new ScheduleDays.DayGrid();
      own.day = regular.day;
      own.grid = ownGroups(special.grid, regular.grid, inPlan);
      OutgoingPublished.addDay(own, things);
    }
    for (ScheduleGrid.GroupRef groupRef : regular.grid.groups) {
      if (!inPlan.contains(groupRef.id)) {
        OutgoingPublished.Thing whole = new OutgoingPublished.Thing();
        whole.day = regular.day;
        whole.groupName = groupRef.name;
        whole.groupId = groupRef.id;
        whole.block = special.name;
        whole.startTime = '';
        whole.endTime = '';
        whole.activity = special.name;
        things.add(whole);
      }
    }
  }

  /** The plan with only the regular day's groups; those kept are added to kept. */
  private static ScheduleGrid ownGroups(
    ScheduleGrid plan,
    ScheduleGrid regular,
    Set<String> kept
  ) {
    Set<String> own = new Set<String>();
    for (ScheduleGrid.GroupRef groupRef : regular.groups) {
      own.add(groupRef.id);
    }
    ScheduleGrid result = new ScheduleGrid();
    result.blocks = plan.blocks;
    result.items = plan.items;
    for (Integer g = 0; g < plan.groups.size(); g++) {
      if (own.contains(plan.groups[g].id)) {
        result.groups.add(plan.groups[g]);
        result.rows.add(plan.rows[g]);
        kept.add(plan.groups[g].id);
      }
    }
    return result;
  }
}
