/**
 * Where a group, station or time block is in a special day's or event's plan (ADR 0014 choice 6):
 * by its id, a record Id (a special day's groups) or the plan's own ("b1", "s2"), never by name.
 */
public with sharing class SpecialPlanIds {
  /** Its position in the ids, or -1. */
  public static Integer indexOf(List<String> ids, String wanted) {
    for (Integer i = 0; i < ids.size(); i++) {
      if (same(ids[i], wanted)) {
        return i;
      }
    }
    return -1;
  }

  /** Whether the plan's time blocks from first are the ones a run was made on. */
  public static Boolean onBlocks(
    SlotEdits.Run run,
    List<String> blockIds,
    Integer first
  ) {
    if (run.blockIds == null || run.blockIds.isEmpty()) {
      throw new ShoreshException(
        'That change could not be read. Reload the page and try again.'
      );
    }
    if (
      run.blockIds.size() != run.after.size() ||
      first + run.blockIds.size() > blockIds.size()
    ) {
      return false;
    }
    for (Integer i = 0; i < run.blockIds.size(); i++) {
      if (!same(blockIds[first + i], run.blockIds[i])) {
        return false;
      }
    }
    return true;
  }

  /** The same id, however a record Id was written (15 or 18 characters). */
  private static Boolean same(String a, String b) {
    if (a == null || b == null) {
      return false;
    }
    if (a.equals(b)) {
      return true;
    }
    try {
      return Id.valueOf(a) == Id.valueOf(b);
    } catch (Exception e) {
      return false;
    }
  }
}
