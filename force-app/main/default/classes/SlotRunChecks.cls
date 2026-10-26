/**
 * What any slot save's runs must keep to (SlotSaves), so a change made on an out-of-date picture
 * of the day is never written: a run starts where a placement starts, and the slots outside it
 * still belong to what they did.
 */
public with sharing class SlotRunChecks {
  /**
   * Whether the slots outside a run still belong to what they did (the run didn't cut into a
   * placement). When they don't, the screen's picture of the day was out of date: a conflict.
   */
  public static Boolean neighboursKept(
    List<String> was,
    List<String> now,
    Set<Integer> inRun
  ) {
    for (Integer b = 0; b < now.size(); b++) {
      if (
        !inRun.contains(b) &&
        !SlotIds.owner(now[b]).equals(SlotIds.owner(was[b]))
      ) {
        return false;
      }
    }
    return true;
  }

  /** A run may not start partway through a placement (it would cut off the part before). */
  public static void checkStartsClean(String firstSlot) {
    if (SlotIds.isCarryOn(firstSlot)) {
      throw new ShoreshException(
        'That change would cut into the cell next to it. Reload the page and try again.'
      );
    }
  }
}
