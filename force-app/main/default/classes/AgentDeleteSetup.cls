/**
 * delete_setup_record: delete one of the season's setup records (the kinds Camp Setup deletes,
 * as rename_setup_record names them), as the person, through an agent or the command line
 * (docs/protocol/api.md API-1.48). Web address /v1/delete_setup_record, POST {season, kind, name,
 * program}. It is Camp Setup's own Delete (SeasonSetupController.deleteRecord): what that screen
 * refuses to delete (something still uses it) is refused in its words, with nothing deleted, and
 * what its question would have said first (how many schedules use it) is said in the answer.
 */
@RestResource(urlMapping='/v1/delete_setup_record')
global with sharing class AgentDeleteSetup implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'kind',
    'name',
    'program'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentDeleteSetup());
  }

  public String run() {
    AgentSetupRecords.Found found = AgentSetupRecords.find(
      AgentFields.body(FIELDS)
    );
    // What the screen's question says before it deletes (decision 15).
    ScheduleUses.Count uses = ScheduleUses.count(found.id);
    try {
      SeasonSetupController.deleteRecord(found.id);
    } catch (Exception e) {
      throw new ShoreshException(
        '"' +
          found.name +
          '" not deleted. Nothing was removed. ' +
          ScreenErrors.words(e)
      );
    }
    return 'Deleted "' + found.name + '".' + usesSaid(uses);
  }

  /** " It was in 2 schedules; they keep its name." or "" when none. */
  private static String usesSaid(ScheduleUses.Count uses) {
    if (uses.schedules > 0) {
      String count = uses.complete
        ? uses.schedules + (uses.schedules == 1 ? ' schedule' : ' schedules')
        : uses.schedules + ' or more schedules';
      return ' It was in ' + count + '; they keep its name.';
    }
    return uses.complete
      ? ''
      : ' Shoresh couldn\'t count the schedules it was in.';
  }
}
