/**
 * unpublish: unpublish a program's Generated Schedule or Manual Build week, as the person, through
 * an agent or the command line (docs/protocol/api.md API-1.36, API-1.41). Web address
 * /v1/unpublish_week, POST {season, week, program, schedule}. It is that screen's own Unpublish
 * (GeneratedScheduleController or ManualBuildController unpublish,
 * naming the published schedule the screen would show), without the question the screen asks
 * first: the week then has nothing published, and the schedule it had is kept as a version marked
 * Published. Its answers are the screen's own sentences.
 */
@RestResource(urlMapping='/v1/unpublish_week')
global with sharing class AgentUnpublish implements AgentRequest.Change {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule'
  };

  @HttpPost
  global static void post() {
    AgentRequest.answer(new AgentUnpublish());
  }

  public Set<String> fields() {
    return FIELDS;
  }

  public String run(Map<String, Object> body) {
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    String weekWord = AgentSchedules.campWordsOf(week)
      .singularInSentence('Week');
    SchedulePublish.Result result;
    try {
      // What the screen shows as published (its Unpublish is only there when there is one).
      SchedulePublish.Preview seen = AgentSchedules.preview(week);
      if (seen.published == null) {
        return week.name +
          ' isn\'t published, so there is nothing to unpublish.';
      }
      // Each screen's own Unpublish (API-1.43).
      result = AgentSchedules.unpublish(week, seen.published.id);
    } catch (Exception e) {
      throw new ShoreshException(
        week.name + ' was not unpublished. ' + ScreenErrors.words(e)
      );
    }
    if (result.publishedChanged) {
      throw new AgentWeeks.ConflictException(
        'Someone else published or unpublished this ' +
          weekWord +
          ' since, so nothing was unpublished.'
      );
    }
    return 'Unpublished ' + week.name + '.';
  }
}
