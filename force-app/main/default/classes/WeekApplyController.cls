/**
 * Server side of Apply to other weeks (WeekApply), the same on Manual Build and Generated Schedule:
 * the draft named says which screen it is. One week per call; the screen goes through them. Every
 * query runs in user mode and every write uses user-mode DML.
 */
public with sharing class WeekApplyController {
  /** What applying the week on screen to that week would do; nothing changes. */
  @AuraEnabled
  public static WeekApply.Outcome previewApply(
    Id scheduleId,
    Id weekId,
    String seenRevisions
  ) {
    try {
      return WeekApply.preview(scheduleId, weekId, seenRevisions);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Applies it, refused with nothing changed (changedSince) if either week was saved since. */
  @AuraEnabled
  public static WeekApply.Outcome applyToWeek(
    Id scheduleId,
    Id weekId,
    String seen
  ) {
    try {
      return WeekApply.apply(scheduleId, weekId, seen);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
