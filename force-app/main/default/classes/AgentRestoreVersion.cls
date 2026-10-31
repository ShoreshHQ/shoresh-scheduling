/**
 * restore: the Versions panel's Restore on a program's Generated Schedule or Manual Build week, as
 * the person, through an agent or the command line (docs/protocol/api.md API-1.34, API-1.41). Web
 * address /v1/restore_version, POST {season, week, program, schedule, version, saved}. It is that
 * panel's own Restore (GeneratedScheduleController or ManualBuildController restoreVersion): the
 * week as it was is kept first as "Before Restore", the way back. On a week not built yet, the version becomes its Generated
 * Schedule, as the panel's Restore does there (restoreVersionAsNew).
 */
@RestResource(urlMapping='/v1/restore_version')
global with sharing class AgentRestoreVersion implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'version',
    'saved'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentRestoreVersion());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.Week week = AgentWeeks.placeOfEither(body);
    ScheduleViews.VersionRow version = AgentVersions.named(week, body);
    if (week.manual) {
      AgentWeeks.requireDraft(week);
    }
    Boolean done;
    try {
      done = restored(week, version);
    } catch (Exception e) {
      throw AgentVersions.failed(
        version.name + ' wasn\'t restored. Nothing was changed.',
        e
      );
    }
    if (!done) {
      throw new AgentWeeks.ConflictException(
        'Someone else changed this ' +
          AgentVersions.labelsOf(week).singularInSentence('Week') +
          ' since you opened it, so nothing was restored.'
      );
    }
    return 'Restored ' + version.name + '.';
  }

  /**
   * The screen's own Restore, Manual Build's or Generated Schedule's (API-1.41): false when
   * someone saved the week since it was read.
   */
  private static Boolean restored(
    AgentWeeks.Week week,
    ScheduleViews.VersionRow version
  ) {
    if (week.manual) {
      return ManualBuildController.restoreVersion(
            week.draft.Id,
            version.id,
            ScheduleDays.stamp(ScheduleDays.read(week.draft.Id))
          )
          .changedSince != true;
    }
    if (week.draft == null) {
      return GeneratedScheduleController.restoreVersionAsNew(
        week.program.Id,
        week.weekId,
        version.id
      );
    }
    return GeneratedScheduleController.restoreVersion(
      week.draft.Id,
      version.id,
      ScheduleDays.stamp(ScheduleDays.read(week.draft.Id))
    );
  }
}
