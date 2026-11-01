/**
 * accept: accept one of a Generated Schedule or Manual Build week's checks, as the person, through an agent or
 * the command line (docs/protocol/api.md API-1.31, API-1.44). Web address /v1/accept_finding,
 * POST {season, week, program, schedule, line}. line is the counter's own line to keep ({ k, s, n }, made by the
 * screen's own module in the connector, c/shoreshWeekChecks lines.js), kept with the week by the
 * counter's own save (WeekAccepts.accept), so it stays away for anyone who opens the week and
 * comes back when it gets worse, as on screen (CORE-6.8).
 */
@RestResource(urlMapping='/v1/accept_finding')
global with sharing class AgentAccept implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'line'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentAccept());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.Week week = AgentSchedules.placeOfEither(body);
    AgentChecks.requireDraft(week);
    try {
      WeekAccepts.accept(week.draft.Id, JSON.serialize(body.get('line')));
    } catch (AuraHandledException e) {
      throw new ShoreshException(e.getMessage());
    }
    return 'Accepted.';
  }
}
