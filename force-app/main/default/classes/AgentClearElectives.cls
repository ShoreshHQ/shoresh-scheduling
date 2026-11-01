/**
 * clear_electives: the Elective seats screen's end-of-season Clear, the whole season or one week,
 * through an agent or the command line (docs/protocol/api.md API-1.72). Web address
 * /v1/clear_electives, POST {season, week, seen}. It is the screen's own Clear
 * (ElectiveSeatsController.clearElectives): the runs with their choices and seats go, and every
 * camper no remaining run uses, for good; sets, offerings and linked choices stay. Done only while
 * the season is still as read_electives_to_clear drew it (seen), with the season's runs locked;
 * otherwise refused (409), nothing cleared.
 */
@RestResource(urlMapping='/v1/clear_electives')
global with sharing class AgentClearElectives implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentClearElectives());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.requireScheduler();
    Season__c season = OutgoingRows.seasonCalled(
      AgentFields.text(body, 'season')
    );
    Id weekId = weekIdOf(season, AgentFields.text(body, 'week'));
    String seen = AgentFields.text(body, 'seen');
    holdAsSeen(season, seen);
    ElectiveClear.Result result;
    try {
      // The screen's own Clear.
      result = ElectiveSeatsController.clearElectives(
        JSON.serialize(
          new Map<String, Object>{
            'seasonId' => season.Id,
            'weekId' => weekId,
            'stamp' => seen
          }
        )
      );
    } catch (Exception e) {
      throw new ShoreshException(
        'Nothing was cleared. ' + ScreenErrors.words(e)
      );
    }
    // The screen's own words for it.
    return 'Cleared: ' +
      result.runs +
      (result.runs == 1 ? ' run, ' : ' runs, ') +
      result.campers +
      (result.campers == 1 ? ' camper.' : ' campers.');
  }

  /** The week asked for; none (null) for the whole season. */
  private static Id weekIdOf(Season__c season, String weekName) {
    return String.isBlank(weekName)
      ? null
      : AgentWeeks.weekIn(season, weekName).Id;
  }

  /**
   * The season's runs held as the screen's Clear holds them, then refused (409) unless the
   * picture is still the one the agent read (its stamp).
   */
  private static void holdAsSeen(Season__c season, String seen) {
    if (String.isBlank(seen)) {
      throw new ShoreshException(
        'Send the seen read_electives_to_clear gave, so nothing is cleared unseen.'
      );
    }
    Integer held = [
        SELECT Id
        FROM ElectiveRun__c
        WHERE Season__c = :season.Id
        WITH USER_MODE
        FOR UPDATE
      ]
      .size();
    ElectiveClear.Picture now = ElectiveSeatsController.clearPicture(season.Id);
    Integer drawn = 0;
    for (ElectiveClear.WeekCounts week : now.weeks) {
      drawn += week.runs;
    }
    // As the screen's Clear checks: the stamp, and no run outside what was drawn.
    if (now.stamp != seen || drawn != held) {
      throw new AgentWeeks.ConflictException(
        'Something changed in ' +
          season.Name +
          '\'s electives since, so nothing was cleared. Read them again with read_electives_to_clear.'
      );
    }
  }
}
