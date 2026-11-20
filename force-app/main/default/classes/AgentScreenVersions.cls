/**
 * Each screen's own Versions panel on a week, as an action through an agent or the command line
 * takes it (docs/protocol/api.md API-1.33, API-1.34, API-1.41, API-1.43): Manual Build's
 * (ManualBuildController) on a Manual Build week, Generated Schedule's on a Generated Schedule
 * week (AgentSchedules finds which), chosen here once, with the same calls and arguments as the
 * screens make. Runs in user mode, as AgentWeeks.
 */
public with sharing class AgentScreenVersions {
  /** The week as it is now, kept as the screen keeps it before Rainy day (Auto-saved). */
  public static Id keepVersion(AgentWeeks.Week week, String name) {
    return week.manual
      ? RainyDayController.keepManualWeek(week.draft.Id, name)
      : RainyDayController.keepGeneratedWeek(week.draft.Id, name);
  }

  /** The Versions panel's own Save version. */
  public static Id saveVersion(AgentWeeks.Week week, String name) {
    return week.manual
      ? ManualBuildController.saveVersion(week.draft.Id, name)
      : GeneratedScheduleController.saveVersion(week.draft.Id, name);
  }

  /** The Versions panel's own delete. */
  public static void deleteVersion(AgentWeeks.Week week, Id versionId) {
    if (week.manual) {
      ManualBuildController.deleteVersion(week.draft.Id, versionId);
    } else {
      GeneratedScheduleController.deleteVersion(week.draft.Id, versionId);
    }
  }

  /**
   * Refused before Restore when the screen has none yet: Manual Build's needs the week started;
   * on Generated Schedule a week not built yet takes the version as its first (restoreVersion).
   */
  public static void requireDraftToRestore(AgentWeeks.Week week) {
    if (week.manual) {
      AgentSchedules.requireDraft(week);
    }
  }

  /**
   * The Versions panel's own Restore: false when someone saved the week since it was read. On a
   * week not built yet, the version becomes its Generated Schedule (restoreVersionAsNew).
   */
  public static Boolean restoreVersion(AgentWeeks.Week week, Id versionId) {
    if (!week.manual && week.draft == null) {
      return GeneratedScheduleController.restoreVersionAsNew(
        week.program.Id,
        week.weekId,
        versionId
      );
    }
    String seen = WeekTickets.stamp(ScheduleDays.read(week.draft.Id));
    return week.manual
      ? ManualBuildController.restoreVersion(week.draft.Id, versionId, seen)
          .changedSince != true
      : GeneratedScheduleController.restoreVersion(
          week.draft.Id,
          versionId,
          seen
        );
  }
}
