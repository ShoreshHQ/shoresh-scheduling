/**
 * start_new_elective_version: Start a new version of a week's finalized elective seats, as the
 * Elective seats screen does, through an agent or the command line (docs/protocol/api.md
 * API-1.70). Web address /v1/start_new_elective_version, POST {season, week, elective_set, seen}.
 * It is the screen's own Start a new version (ElectiveSeatsController.startNewVersion): a new run
 * to work on, with the final run's choices, locks and moves made by hand; the final run stays as
 * it was. Done only while the final run is still the one the agent read (seen), with it locked;
 * otherwise refused (409), nothing started.
 */
@RestResource(urlMapping='/v1/start_new_elective_version')
global with sharing class AgentStartNewElectiveVersion implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'elective_set',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentStartNewElectiveVersion());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentElectives.Run run = AgentElectives.committedOrFinal(body);
    Decimal seen = AgentElectives.seenOf(body);
    if (!run.isFinal) {
      throw new AgentWeeks.ConflictException(
        run.setName +
          ' in ' +
          run.weekName +
          ' already has a version being worked on, so no new one was started. Read it with read_elective_seats_now.'
      );
    }
    AgentElectives.holdAsSeen(run, seen);
    try {
      // The screen's own Start a new version.
      ElectiveSeatsController.startNewVersion(run.id);
    } catch (Exception e) {
      throw new ShoreshException(
        'No new version was started. ' + ScreenErrors.words(e)
      );
    }
    // The screen's own words for it.
    return 'A new version started, with the choices, locks and moves made by hand.';
  }
}
