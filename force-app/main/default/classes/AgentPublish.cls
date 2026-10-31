/**
 * publish: publish a program's Generated Schedule or Manual Build week, as the person, through an
 * agent or the command line (docs/protocol/api.md API-1.22, API-1.41). Web address
 * /v1/publish_week, POST {season, week, program, schedule}. It is that screen's own Publish
 * (GeneratedScheduleController or ManualBuildController previewPublish,
 * then publish with what the preview saw), without the question the screen may ask first (Greg,
 * 2026-10-30: an agent publishes without asking). Its answers are the screen's own sentences.
 */
@RestResource(urlMapping='/v1/publish_week')
global with sharing class AgentPublish implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentPublish());
  }

  public String run() {
    AgentWeeks.Week week = AgentSchedules.eitherOf(AgentFields.body(FIELDS));
    String weekWord = CampLabels.forCamp(
        week.draft.Program__r.Season__r.Camp__c
      )
      .singularInSentence('Week');
    SchedulePublish.Result result;
    try {
      // Each screen's own Publish (API-1.43).
      result = AgentSchedules.publish(week, AgentSchedules.preview(week));
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
