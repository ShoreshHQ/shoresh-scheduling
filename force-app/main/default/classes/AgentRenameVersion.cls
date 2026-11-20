/**
 * rename: the Versions panel's rename on a program's Generated Schedule week, as the person,
 * through an agent or the command line (docs/protocol/api.md API-1.33). Web address
 * /v1/rename_version, POST {season, week, program, version, saved, name}, by the panel's own
 * rename (SchedulesController.renameSchedule).
 */
@RestResource(urlMapping='/v1/rename_version')
global with sharing class AgentRenameVersion implements AgentRequest.Change {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'version',
    'saved',
    'name'
  };

  @HttpPost
  global static void post() {
    AgentRequest.answer(new AgentRenameVersion());
  }

  public Set<String> fields() {
    return FIELDS;
  }

  public String run(Map<String, Object> body) {
    AgentWeeks.Week week = AgentWeeks.placeOf(body);
    ScheduleViews.VersionRow version = AgentVersions.named(week, body);
    String name = AgentFields.text(body, 'name');
    try {
      SchedulesController.renameSchedule(version.id, name);
    } catch (Exception e) {
      throw AgentVersions.failed(version.name + ' wasn\'t renamed.', e);
    }
    return 'Renamed ' + version.name + ' to ' + name + '.';
  }
}
