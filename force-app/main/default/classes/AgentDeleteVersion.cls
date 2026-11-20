/**
 * delete: the Versions panel's delete on a program's Generated Schedule or Manual Build week, as
 * the person, through an agent or the command line (docs/protocol/api.md API-1.33, API-1.41). Web
 * address /v1/delete_version, POST {season, week, program, schedule, version, saved}, by that
 * panel's own delete (GeneratedScheduleController or ManualBuildController deleteVersion): a version once published is kept as history, an
 * imported week as it came in, and a week not built yet has no delete, as on the panel.
 */
@RestResource(urlMapping='/v1/delete_version')
global with sharing class AgentDeleteVersion implements AgentRequest.Change, AgentAskFirst.Preview {
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
    AgentRequest.answer(new AgentDeleteVersion());
  }

  public Set<String> fields() {
    return FIELDS;
  }

  /** What the delete takes away (API-1.106). */
  public String preview(Map<String, Object> body) {
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    ScheduleViews.VersionRow version = AgentVersions.named(week, body);
    // The very version shown: a later one of the same name is another delete.
    AgentAskFirst.stateIs(version.id + ' ' + AgentVersions.savedOf(version));
    return 'This deletes the saved version "' +
      version.name +
      '" of ' +
      week.name +
      ' (' +
      week.program.Name +
      ', ' +
      AgentSchedules.screenOf(week) +
      ') for good.';
  }

  public String run(Map<String, Object> body) {
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    ScheduleViews.VersionRow version = AgentVersions.named(week, body);
    try {
      // Each screen's own delete (API-1.41).
      AgentScreenVersions.deleteVersion(week, version.id);
    } catch (Exception e) {
      throw AgentVersions.failed(version.name + ' wasn\'t deleted.', e);
    }
    return 'Deleted ' + version.name + '.';
  }
}
