/**
 * Server side of Manual Build (desktop: the Manual schedule screen): open a program's draft for a
 * week, start a blank week, save slot edits (each made only if its slots still hold what the
 * director saw), add an activity typed into a slot, its versions: Save version, Restore, Delete
 * (ManualVersions), and Publish (SchedulePublish). Every query runs in user mode and every write
 * uses user-mode DML.
 */
public with sharing class ManualBuildController {
  /** The program's Manual Build draft for the week, or null when it has not been started. */
  @AuraEnabled
  public static ManualBuildViews.DraftView getDraft(Id programId, Id weekId) {
    try {
      Schedule__c draft = ManualDrafts.find(programId, weekId);
      return draft == null ? null : ManualBuildViews.open(draft.Id);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** "Start a blank week": fixed and recurring activities placed, everything else Open. */
  @AuraEnabled
  public static ManualBuildViews.DraftView startBlankWeek(
    Id programId,
    Id weekId
  ) {
    try {
      GeneratedSetup setup = new GeneratedSetup(programId, weekId);
      ManualDrafts.Started started = ManualDrafts.startWith(setup);
      ManualBuildViews.DraftView view = ManualBuildViews.openWith(
        started.draftId,
        setup
      );
      view.notPlaced = started.notPlaced;
      return view;
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  @AuraEnabled
  public static SlotEdits.Result saveSlots(
    Id scheduleId,
    List<SlotEdits.Edit> edits
  ) {
    try {
      return SlotSaves.save(
        scheduleId,
        edits == null ? new List<SlotEdits.Edit>() : edits
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** "Add <name>" from a slot: a new activity (or the one with that name already). */
  @AuraEnabled
  public static ManualBuildViews.ActivityOption addActivity(
    Id scheduleId,
    String name
  ) {
    try {
      return ManualBuildActivities.add(scheduleId, name);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Save version: the draft as it is now, kept under a name. */
  @AuraEnabled
  public static Id saveVersion(Id scheduleId, String name) {
    try {
      return ManualVersions.save(scheduleId, name);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * Restore: the version's days become the draft's (the draft kept first as "Before Restore").
   * Refused (changedSince) when someone saved a day since the screen read the week.
   */
  @AuraEnabled
  public static ManualBuildViews.DraftView restoreVersion(
    Id scheduleId,
    Id versionId,
    String seenRevisions
  ) {
    try {
      ManualVersions.restore(scheduleId, versionId, seenRevisions);
      return ManualBuildViews.open(scheduleId);
    } catch (ManualVersions.ChangedSinceException e) {
      // Nothing changed: the screen says someone else changed the week, and offers Reload.
      ManualBuildViews.DraftView refused = new ManualBuildViews.DraftView();
      refused.changedSince = true;
      return refused;
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Delete: a version of the draft's week goes for good. */
  @AuraEnabled
  public static void deleteVersion(Id scheduleId, Id versionId) {
    try {
      ManualVersions.remove(scheduleId, versionId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * What publishing the week now would do: the published schedule it replaces (if any) and the
   * cells that would change, shown to the director before Publish.
   */
  @AuraEnabled
  public static SchedulePublish.Preview previewPublish(Id scheduleId) {
    try {
      return SchedulePublish.preview(ManualDrafts.locked(scheduleId));
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * Publish: the week as the preview showed it becomes its published schedule. Refused, with
   * nothing changed, when the week (seenRevisions) or its published schedule (seenPublishedId)
   * changed since the preview.
   */
  @AuraEnabled
  public static SchedulePublish.Result publish(
    Id scheduleId,
    String seenRevisions,
    Id seenPublishedId
  ) {
    try {
      return SchedulePublish.publish(
        ManualDrafts.locked(scheduleId),
        seenRevisions,
        seenPublishedId
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * What "Start from another week" can start from: the program's other weeks' Manual Build, and
   * every published schedule and version of the program (this week's too), each with its week's
   * name.
   */
  @AuraEnabled
  public static List<ManualBuildViews.WeekSource> getWeekSources(
    Id programId,
    Id weekId
  ) {
    try {
      return ManualBuildViews.weekSources(programId, weekId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** "Start from another week": the week begins as the chosen one, matched by weekday. */
  @AuraEnabled
  public static ManualBuildViews.DraftView startFromWeek(
    Id programId,
    Id weekId,
    Id sourceId
  ) {
    try {
      // The program's setup for the week, read once for everything the start does.
      GeneratedSetup setup = new GeneratedSetup(programId, weekId);
      ManualWeekStart.Started started = ManualWeekStart.startWith(
        setup,
        sourceId
      );
      ManualBuildViews.DraftView view = ManualBuildViews.openWith(
        started.draftId,
        setup
      );
      view.notPlaced = started.notPlaced;
      view.leftOut = started.leftOut;
      view.startedBySomeoneElse = !started.copied;
      return view;
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
