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
    AgentWeeks.Week week = AgentSchedules.placeOfEither(body);
    ScheduleViews.VersionRow version = AgentVersions.named(week, body);
    AgentScreenVersions.requireDraftToRestore(week);
    Boolean done;
    try {
      done = AgentScreenVersions.restoreVersion(week, version.id);
    } catch (Exception e) {
      throw AgentVersions.failed(
        version.name + ' wasn\'t restored. Nothing was changed.',
        e
      );
    }
    if (!done) {
      throw new AgentWeeks.ConflictException(
        'Someone else changed this ' +
          AgentSchedules.campWordsOf(week).singularInSentence('Week') +
          ' since you opened it, so nothing was restored.'
      );
    }
    if (week.draft != null) {
      // As on the screen, Undo starts over after a Restore; "Before Restore" is the way back.
      Map<String, Object> undo = AgentUndoHeld.entry(
        week.draft.Id,
        'none',
        'Restored ' + version.name
      );
      undo.put('version_name', ManualVersions.BEFORE_RESTORE);
      AgentUndoHeld.hold(undo);
    }
    return 'Restored ' + version.name + '.';
  }
}
