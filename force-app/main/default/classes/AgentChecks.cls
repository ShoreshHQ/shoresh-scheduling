/**
 * read: a program's Generated Schedule or Manual Build week's checks, as the person, through an
 * agent or the command line (docs/protocol/api.md API-1.30, API-1.44). Web address
 * /v1/week_checks, GET ?season=&week=&program=&schedule=. On Manual Build it answers what that
 * screen reads (its draft, ManualBuildViews.open) in place of what Generate reads. The checks are worked out where the screen works them out, outside
 * Salesforce (the connector runs the same modules the screen's counter does), so this answers what
 * the screen reads to show them: what Generate reads (AgentBuild.readOf), what setup changed since
 * the week was built (SetupMatchController.getSetupChanges, the screen's own) and the lines
 * accepted with the week (WeekAccepts.accepted, the counter's own).
 */
@RestResource(urlMapping='/v1/week_checks')
global with sharing class AgentChecks {
  @HttpGet
  global static void get() {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      Map<String, Object> asked = new Map<String, Object>();
      for (
        String field : new List<String>{
          'season',
          'week',
          'program',
          AgentSchedules.SCHEDULE
        }
      ) {
        asked.put(field, RestContext.request.params.get(field));
      }
      AgentWeeks.Week week = AgentSchedules.placeOfEither(asked);
      requireDraft(week);
      Map<String, Object> read;
      if (week.manual) {
        // What Manual Build reads: its draft (getDraft's), the season's setup and the camp's words.
        read = AgentBuild.setupOf(week);
        read.put('draft', ManualBuildViews.open(week.draft.Id));
      } else {
        read = AgentBuild.readOf(week);
      }
      read.put(
        'setup_changes',
        SetupMatchController.getSetupChanges(week.draft.Id)
      );
      read.put('accepted', WeekAccepts.accepted(week.draft.Id));
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(JSON.serialize(read, true));
    } catch (Exception e) {
      Boolean ours =
        e instanceof ShoreshException || e instanceof AuraHandledException;
      response.statusCode = ours ? 400 : 500;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, String>{
            'message' => ours ? e.getMessage() : ScreenErrors.loadingWords(e)
          }
        )
      );
    }
  }

  /** Refused before the week is built (Generated Schedule) or started (Manual Build). */
  public static void requireDraft(AgentWeeks.Week week) {
    if (week.draft == null && !week.manual) {
      throw new ShoreshException(notBuilt(week));
    }
    AgentSchedules.requireDraft(week);
  }

  /** A week never built has no checks: Generated Schedule shows none until it is. */
  public static String notBuilt(AgentWeeks.Week week) {
    return week.name +
      ' hasn\'t been built for ' +
      week.program.Name +
      ' yet, so it has no checks. Build it first (build_week).';
  }
}
