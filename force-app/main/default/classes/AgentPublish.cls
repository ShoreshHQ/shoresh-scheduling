/**
 * publish: publish a program's Generated Schedule week, as the person, through an agent or the
 * command line (docs/protocol/api.md API-1.22). Web address /v1/publish_week, POST {season, week,
 * program}. It is Generated Schedule's own Publish (GeneratedScheduleController.previewPublish,
 * then publish with what the preview saw), without the question the screen may ask first (Greg,
 * 2026-10-30: an agent publishes without asking). Its answers are the screen's own sentences.
 */
@RestResource(urlMapping='/v1/publish_week')
global with sharing class AgentPublish implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentPublish());
  }

  public String run() {
    AgentWeeks.Week week = AgentWeeks.weekOf(AgentFields.body(FIELDS));
    String weekWord = CampLabels.forCamp(
        week.draft.Program__r.Season__r.Camp__c
      )
      .singularInSentence('Week');
    SchedulePublish.Result result;
    try {
      SchedulePublish.Preview preview = GeneratedScheduleController.previewPublish(
        week.draft.Id
      );
      result = GeneratedScheduleController.publish(
        week.draft.Id,
        preview.revisions,
        preview.published == null ? null : preview.published.id
      );
    } catch (Exception e) {
      throw new ShoreshException(
        week.name + ' was not published. ' + ScreenErrors.words(e)
      );
    }
    if (result.draftChanged) {
      throw new AgentWeeks.ConflictException(
        'Someone else changed this ' +
          weekWord +
          ' since, so nothing was published.'
      );
    }
    if (result.publishedChanged) {
      throw new AgentWeeks.ConflictException(
        'Someone else published this ' +
          weekWord +
          ' since, so nothing was replaced.'
      );
    }
    return result.unchanged
      ? week.name + ' is already published as it is.'
      : 'Published ' + week.name + '.';
  }
}
