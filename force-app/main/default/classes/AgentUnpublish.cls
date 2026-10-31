/**
 * unpublish: unpublish a program's Generated Schedule week, as the person, through an agent or the
 * command line (docs/protocol/api.md API-1.36). Web address /v1/unpublish_week, POST {season,
 * week, program}. It is Generated Schedule's own Unpublish (GeneratedScheduleController.unpublish,
 * naming the published schedule the screen would show), without the question the screen asks
 * first: the week then has nothing published, and the schedule it had is kept as a version marked
 * Published. Its answers are the screen's own sentences.
 */
@RestResource(urlMapping='/v1/unpublish_week')
global with sharing class AgentUnpublish implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentUnpublish());
  }

  public String run() {
    AgentWeeks.Week week = AgentWeeks.weekOf(AgentFields.body(FIELDS));
    String weekWord = AgentVersions.labelsOf(week).singularInSentence('Week');
    SchedulePublish.Result result;
    try {
      // What the screen shows as published (its Unpublish is only there when there is one).
      SchedulePublish.Preview seen = GeneratedScheduleController.previewPublish(
        week.draft.Id
      );
      if (seen.published == null) {
        return week.name +
          ' isn\'t published, so there is nothing to unpublish.';
      }
      result = GeneratedScheduleController.unpublish(
        week.draft.Id,
        seen.published.id
      );
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
