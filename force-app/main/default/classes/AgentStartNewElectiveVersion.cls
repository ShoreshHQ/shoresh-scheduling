/**
 * change_seats: Change seats on a week's finalized elective seats, as the
 * Elective seats screen does, through an agent or the command line (docs/protocol/api.md
 * API-1.70). Web address /v1/change_seats, POST {season, week, elective_set, seen}.
 * It is the screen's own Change seats (ElectiveSeatsController.startNewVersion): a new run
 * to work on, with the final run's choices, locks and moves made by hand; the final run stays as
 * it was. Done only while the final run is still the one the agent read (seen), with it locked;
 * otherwise refused (409), nothing started.
 */
@RestResource(urlMapping='/v1/change_seats')
global with sharing class AgentStartNewElectiveVersion implements AgentRequest.Change {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'elective_set',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentRequest.answer(new AgentStartNewElectiveVersion());
  }

  public Set<String> fields() {
    return FIELDS;
  }

  public String run(Map<String, Object> body) {
    AgentElectives.Run run = AgentElectives.committedOrFinal(body);
    Decimal seen = AgentElectives.seenOf(body, run);
    if (!run.isFinal) {
      throw new AgentWeeks.ConflictException(
        run.setName +
          ' in ' +
          run.weekName +
          ' already has a draft being changed, so nothing was reopened. Read it with read_elective_seats_now.'
      );
    }
    AgentElectives.holdAsSeen(run, seen);
    try {
      // The screen's own Change seats.
      ElectiveSeatsController.startNewVersion(run.id);
    } catch (Exception e) {
      throw new ShoreshException(
        run.labels().plural('Seats') + ' not reopened. ' + ScreenErrors.words(e)
      );
    }
    // The screen's own words for it.
    return 'A new draft of these ' +
      run.labels().pluralInSentence('Seats') +
      ', with the choices, locks and moves made by hand.';
  }
}
