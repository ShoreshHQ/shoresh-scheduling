/**
 * Start over's or Rebuild's Undo on Generated Schedule: the version the build kept becomes the
 * week again, as Restore does it (GeneratedScheduleController.restoreVersion), the week kept first
 * named after what was pressed, "Before Undo", not "Before Restore" (word walk W6).
 */
public with sharing class GeneratedUndoController {
  /** True when undone; false, with nothing changed, when someone saved the week since. */
  @AuraEnabled
  public static Boolean undoBuild(
    Id scheduleId,
    Id versionId,
    String seenRevisions
  ) {
    ManualVersions.keptAs = ManualVersions.BEFORE_UNDO;
    try {
      ManualVersions.restoreInto(
        GeneratedDrafts.lockedToEdit(scheduleId),
        versionId,
        seenRevisions
      );
      return true;
    } catch (ManualVersions.ChangedSinceException e) {
      return false;
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    } finally {
      ManualVersions.keptAs = ManualVersions.BEFORE_RESTORE;
    }
  }
}
