/**
 * Undo of "Add <name>" typed into a cell (LOCK-5.5): the activity that step made is taken off the
 * season again while nothing else uses it, from Manual Build's draft or Generated Schedule's
 * (ManualBuildActivities). Its own class, so the two screens' controllers stay within Code
 * Analyzer's limits.
 */
public with sharing class AddedActivityController {
  /** From Manual Build's draft. True when the activity was taken off. */
  @AuraEnabled
  public static Boolean removeFromManualBuild(Id scheduleId, Id activityId) {
    try {
      return ManualBuildActivities.removeFromManualBuild(
        scheduleId,
        activityId
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** From Generated Schedule's draft. True when the activity was taken off. */
  @AuraEnabled
  public static Boolean removeFromGenerated(Id scheduleId, Id activityId) {
    try {
      return ManualBuildActivities.removeFromGenerated(scheduleId, activityId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
