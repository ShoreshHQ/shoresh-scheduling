/**
 * Server side of the schedule inside a special day or special event (ADR 0014 choices 14 to 17),
 * opened from its details on the Special events screen: open it, save cell edits (as Manual
 * Build does), change its time blocks and an event's stations, add an activity typed into a
 * cell, and import it from a file. Every query runs in user mode and every write uses user-mode
 * DML.
 */
public with sharing class SpecialScheduleController {
  @AuraEnabled
  public static SpecialSchedule.PlanView openPlan(Id itemId) {
    try {
      return SpecialSchedule.open(itemId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** Cell edits, each made only if its cells still hold what the director saw. */
  @AuraEnabled
  public static SlotEdits.Result saveCells(
    Id itemId,
    List<SlotEdits.Edit> edits
  ) {
    try {
      return SpecialScheduleEdits.save(
        itemId,
        edits == null ? new List<SlotEdits.Edit>() : edits
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** A time block or station added, changed, moved or taken out, or every cell cleared. */
  @AuraEnabled
  public static SpecialSchedule.PlanView changeFrame(
    Id itemId,
    Integer revision,
    SpecialScheduleFrame.Change change
  ) {
    try {
      return SpecialScheduleFrame.apply(itemId, revision, change);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** "Add <name>" from a cell: the season's activity of that name, or a new one. */
  @AuraEnabled
  public static ManualBuildViews.ActivityOption addActivity(
    Id itemId,
    String name
  ) {
    try {
      return SpecialActivities.add(
        SpecialSchedule.ownerOf(itemId).seasonId,
        name
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** An empty schedule filled from a file the screen has read. */
  @AuraEnabled
  public static SpecialScheduleImport.Outcome importPlan(
    Id itemId,
    Integer revision,
    SpecialScheduleImport.Imported imported
  ) {
    try {
      return SpecialScheduleImport.apply(itemId, revision, imported);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
