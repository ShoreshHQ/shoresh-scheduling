/**
 * Server side of Generated Schedule (ADR 0010): what the engine needs to build a program's week,
 * and saving the week it built. Anyone with the Shoresh Scheduler permission set can generate
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
}
