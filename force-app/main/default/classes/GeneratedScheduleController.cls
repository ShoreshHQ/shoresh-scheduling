/**
 * Server side of Generated Schedule (ADR 0010): what the engine needs to build a program's week,
 * saving the week it built, hand edits and locks, its versions (Save version, Restore, Delete:
 * ManualVersions, as on Manual Build), and Publish and Unpublish (SchedulePublish, as on Manual
 * Build). Anyone with the Shoresh Scheduler permission set can generate
 * (Greg, 2026-10-17). Every query runs in user mode and every write uses user-mode DML.
 */
public with sharing class GeneratedScheduleController {
  @AuraEnabled
  public static GeneratedInputs.Inputs getInputs(Id programId, Id weekId) {
    try {
      return GeneratedInputs.read(programId, weekId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** Saves the whole week, or answers with a conflict when someone else saved it since. */
  @AuraEnabled
  public static GeneratedWeek.Result saveWeek(GeneratedWeek.Save request) {
    try {
      return GeneratedSaves.save(request);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * A hand edit on the Generated draft (Manual Build's slot saves, the same conflicts): every cell
   * an edit fills is locked (decision 2).
   */
  @AuraEnabled
  public static SlotEdits.Result saveSlots(
    Id scheduleId,
    List<SlotEdits.Edit> edits,
    String revision
  ) {
    try {
      return SlotSaves.saveOnGenerated(
        scheduleId,
        edits == null ? new List<SlotEdits.Edit>() : edits,
        revision
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * "Add <name> to activities" while typing in a cell, as on Manual Build (the desktop's generated
   * schedule allows it too): the season's activity by that name, made if there is none.
   */
  @AuraEnabled
  public static ManualBuildViews.ActivityOption addActivity(
    Id scheduleId,
    String name
  ) {
    try {
      return ManualBuildActivities.addOnGenerated(scheduleId, name);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Lock or unlock a cell, a day or a group (decision 3); a conflict if the week changed since. */
  @AuraEnabled
  public static GeneratedWeek.Locked setLocks(
    Id scheduleId,
    List<GeneratedWeek.LockChange> changes,
    String revision
  ) {
    try {
      return GeneratedLocks.apply(scheduleId, changes, revision);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * What publishing the week now would do (Manual Build's preview, ADR 0008 part 5): the
   * published schedule it replaces (if any) and the cells that would change.
   */
  @AuraEnabled
  public static SchedulePublish.Preview previewPublish(Id scheduleId) {
    try {
      return SchedulePublish.preview(GeneratedDrafts.lockedToEdit(scheduleId));
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * Publish: the week as the preview showed it, locks and all, becomes its published schedule.
   * Refused, with nothing changed, when the week (seenRevisions) or its published schedule
   * (seenPublishedId) changed since the preview.
   */
  @AuraEnabled
  public static SchedulePublish.Result publish(
    Id scheduleId,
    String seenRevisions,
    Id seenPublishedId
  ) {
    try {
      return SchedulePublish.publish(
        GeneratedDrafts.lockedToEdit(scheduleId),
        seenRevisions,
        seenPublishedId
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * Unpublish: the week's published schedule (the one the screen showed) is kept as history and
   * the week has none. Refused, with nothing changed, when the week was published or unpublished
   * since.
   */
  @AuraEnabled
  public static SchedulePublish.Result unpublish(
    Id scheduleId,
    Id seenPublishedId
  ) {
    try {
      return SchedulePublish.unpublish(
        GeneratedDrafts.lockedToEdit(scheduleId),
        seenPublishedId
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Save version: the Generated week as it is now, locks and option too, kept under a name. */
  @AuraEnabled
  public static Id saveVersion(Id scheduleId, String name) {
    try {
      return ManualVersions.saveOf(
        GeneratedDrafts.lockedToEdit(scheduleId),
        name
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * Restore: the version's days, locks included, become the Generated week's (the week kept first
   * as "Before Restore"). False, with nothing changed, when someone saved the week since the
   * screen read it (seenRevisions); the screen then offers Reload.
   */
  @AuraEnabled
  public static Boolean restoreVersion(
    Id scheduleId,
    Id versionId,
    String seenRevisions
  ) {
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
    }
  }

  /**
   * Restore on a week not generated yet: the version becomes the week's Generated Schedule (Greg's
   * decision 9). False, with nothing changed, when the week was generated meanwhile.
   */
  @AuraEnabled
  public static Boolean restoreVersionAsNew(
    Id programId,
    Id weekId,
    Id versionId
  ) {
    try {
      return GeneratedDrafts.startFrom(programId, weekId, versionId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Delete: a version of the week goes for good; one ever published is kept as history. */
  @AuraEnabled
  public static void deleteVersion(Id scheduleId, Id versionId) {
    try {
      ManualVersions.removeFrom(
        GeneratedDrafts.lockedToEdit(scheduleId),
        versionId
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
