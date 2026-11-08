/**
 * delete_setup_record: delete one of the season's setup records (the kinds Camp Setup deletes,
 * as rename_setup_record names them), as the person, through an agent or the command line
 * (docs/protocol/api.md API-1.48, API-1.102). Web address /v1/delete_setup_record: GET
 * ?season=&kind=&name=&program= answers Camp Setup's question before its Delete, word for word,
 * or refuses in its words what it would refuse; POST {season, kind, name, program} is Camp
 * Setup's own Delete. Both are SetupDelete's, as the screen's are: what the screen refuses
 * (something still uses it) is refused with nothing deleted, and how many schedules it was in is
 * said in the answer.
 */
@RestResource(urlMapping='/v1/delete_setup_record')
global with sharing class AgentDeleteSetup implements AgentWeeks.Action, AgentAskFirst.Preview {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'kind',
    'name',
    'program'
  };

  @HttpGet
  global static void get() {
    AgentWeeks.answer(new AgentDeleteSetup());
  }

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentDeleteSetup());
  }

  /** Camp Setup's own question before its Delete (API-1.106). */
  public String preview() {
    AgentSetupRecords.Found found = AgentSetupRecords.find(
      AgentFields.body(FIELDS)
    );
    // The very record shown: one made since under the same name is another delete.
    AgentAskFirst.stateIs(found.id);
    return question(found);
  }

  public String run() {
    if (RestContext.request.httpMethod == 'GET') {
      return question(AgentSetupRecords.find(AgentReadSetup.asked()));
    }
    AgentSetupRecords.Found found = AgentSetupRecords.find(
      AgentFields.body(FIELDS)
    );
    return removed(found);
  }

  /** Camp Setup's own Delete, and what it says; or its refusal with nothing deleted. */
  public static String removed(AgentSetupRecords.Found found) {
    SetupDelete.Preview preview;
    try {
      preview = SetupDelete.preview(found.id);
      SetupDelete.remove(found.id);
    } catch (Exception e) {
      throw notDeleted(found, ScreenErrors.words(e));
    }
    return 'Deleted "' + found.name + '".' + usesSaid(preview.uses);
  }

  /** Camp Setup's question before its Delete, or its refusal with nothing deleted. */
  public static String question(AgentSetupRecords.Found found) {
    SetupDelete.Preview preview = SetupDelete.preview(found.id);
    if (preview.refusal != null) {
      throw notDeleted(found, preview.refusal);
    }
    return preview.message;
  }

  private static ShoreshException notDeleted(
    AgentSetupRecords.Found found,
    String why
  ) {
    return new ShoreshException(
      '"' + found.name + '" not deleted. Nothing was removed. ' + why
    );
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
