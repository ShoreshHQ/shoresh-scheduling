/**
 * restore: the Versions panel's Restore on a program's Generated Schedule week, as the person,
 * through an agent or the command line (docs/protocol/api.md API-1.34). Web address
 * /v1/restore_version, POST {season, week, program, version, saved}. It is the panel's own
 * Restore (GeneratedScheduleController.restoreVersion): the week as it was is kept first as
 * "Before Restore", the way back. On a week not built yet, the version becomes its Generated
 * Schedule, as the panel's Restore does there (restoreVersionAsNew).
 */
@RestResource(urlMapping='/v1/restore_version')
global with sharing class AgentRestoreVersion implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'version',
    'saved'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentRestoreVersion());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.Week week = AgentWeeks.placeOf(body);
    ScheduleViews.VersionRow version = AgentVersions.named(week, body);
    Boolean done;
    try {
      done = week.draft == null
        ? GeneratedScheduleController.restoreVersionAsNew(
            week.program.Id,
            week.weekId,
            version.id
          )
        : GeneratedScheduleController.restoreVersion(
            week.draft.Id,
            version.id,
            ScheduleDays.stamp(ScheduleDays.read(week.draft.Id))
          );
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
}
