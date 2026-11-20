/**
 * save: the Versions panel's Save version on a program's Generated Schedule or Manual Build week,
 * as the person, through an agent or the command line (docs/protocol/api.md API-1.33, API-1.41).
 * Web address /v1/save_version, POST {season, week, program, schedule, name}: the week as it is
 * now, locks and option too, kept under that name by that panel's own save
 * (GeneratedScheduleController or ManualBuildController saveVersion).
 */
@RestResource(urlMapping='/v1/save_version')
global with sharing class AgentSaveVersion implements AgentRequest.Change {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'name'
  };

  @HttpPost
  global static void post() {
    AgentRequest.answer(new AgentSaveVersion());
  }

  public Set<String> fields() {
    return FIELDS;
  }

  public String run(Map<String, Object> body) {
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    String name = AgentFields.text(body, 'name');
    try {
      // Each screen's own Save version (API-1.41).
      AgentScreenVersions.saveVersion(week, name);
    } catch (Exception e) {
      if (String.isBlank(name)) {
        throw new ShoreshException(ScreenErrors.words(e));
      }
      throw AgentVersions.failed(name + ' wasn\'t saved.', e);
    }
    return 'Saved ' + name + '.';
  }
}
