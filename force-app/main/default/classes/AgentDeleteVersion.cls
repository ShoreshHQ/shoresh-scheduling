/**
 * delete: the Versions panel's delete on a program's Generated Schedule week, as the person,
 * through an agent or the command line (docs/protocol/api.md API-1.33). Web address
 * /v1/delete_version, POST {season, week, program, version, saved}, by the panel's own delete
 * (GeneratedScheduleController.deleteVersion): a version once published is kept as history, an
 * imported week as it came in, and a week not built yet has no delete, as on the panel.
 */
@RestResource(urlMapping='/v1/delete_version')
global with sharing class AgentDeleteVersion implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'version',
    'saved'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentDeleteVersion());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.Week week = AgentWeeks.weekOf(body);
    ScheduleViews.VersionRow version = AgentVersions.named(week, body);
    try {
      GeneratedScheduleController.deleteVersion(week.draft.Id, version.id);
    } catch (Exception e) {
      throw AgentVersions.failed(version.name + ' wasn\'t deleted.', e);
    }
    return 'Deleted ' + version.name + '.';
  }
}
