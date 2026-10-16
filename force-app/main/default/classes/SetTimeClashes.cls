/**
 * Finds the first clash in a season's fixed and recurring activities, in a fixed order so the
 * same setup always gives the same message: an item running past the last time block, a
 * recurring activity ticked for a day its program does not run, two items with the same group at
 * the same time, then a location with more groups at once than fit.
 */
public with sharing class SetTimeClashes {
  public static SetTimeClash first(SetTimePlan plan) {
    SetTimeClash clash = shape(plan);
    if (clash == null) {
      clash = SetTimeGroupClashes.first(plan);
    }
    if (clash == null) {
      clash = SetTimeLocationClashes.first(plan);
    }
    return clash;
  }

  private static SetTimeClash shape(SetTimePlan plan) {
    for (SetTimePlan.Item item : plan.items) {
      if (
        item.start == null ||
        item.start + item.length > item.program.blocks.size()
      ) {
        return new SetTimeClash(SetTimeClash.Kind.PAST_END, item);
      }
      for (String day : item.days) {
        if (!item.program.days.contains(day)) {
          SetTimeClash clash = new SetTimeClash(
            SetTimeClash.Kind.CLOSED_DAY,
            item
          );
          clash.day = day;
          return clash;
        }
      }
    }
    return null;
  }
}
