/**
 * change_setup_record: change fields of one of the season's setup records other than its name
 * (times, dates, days, places, limits, a group's division, the weeks it runs in, who a recurring
 * activity covers), as the person, through an agent or the
 * command line (docs/protocol/api.md API-1.49). Web address /v1/change_setup_record, POST {season,
 * kind, name, program, fields, seen}. Found as rename_setup_record finds it; it is the setup
 * table's own row save (SetupTablesController.saveRow) with what the agent read
 * (read_setup_record) sent as seen, so someone else's change since it read is refused, never
 * overwritten. Answered and refused in the save's own words.
 */
@RestResource(urlMapping='/v1/change_setup_record')
global with sharing class AgentChangeSetup implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'kind',
    'name',
    'program',
    'fields',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentChangeSetup());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentSetupRecords.Found found = AgentSetupRecords.find(body);
    SObject record = found.id.getSObjectType().newSObject(found.id);
    Map<String, Object> given = AgentSetupFields.given(body.get('fields'));
    // The weeks it runs in and who it covers go with the row as its ticks (API-1.53, API-1.54).
    Map<String, Object> lists = AgentRunsIn.takeOut(given, found.term);
    AgentSetupFields.Put put = AgentSetupFields.put(record, given, found);
    AgentSetupNotes.refuseTooFewGroups(record);
    refuseNothingAsked(put, lists, found);
    SObject seen = AgentSetupFields.seen(found.id, body.get('seen'), put);
    if (!lists.isEmpty()) {
      put.said.addAll(AgentRunsIn.ready(lists, body.get('seen'), put));
    }
    RowSaves.Result result;
    try {
      // The setup table's own save of one row (ADR 0011).
      result = SetupTablesController.saveRow(record, seen, put.extras);
    } catch (Exception e) {
      throw new ShoreshException(
        '"' + found.name + '" not saved. ' + ScreenErrors.words(e)
      );
    }
    if (!result.saved()) {
      throw new AgentWeeks.ConflictException(
        'Someone else changed "' +
          found.name +
          '" since, so nothing was saved. Read it again in Shoresh.'
      );
    }
    return 'Changed the ' +
      found.kind +
      ' "' +
      found.name +
      '": ' +
      String.join(put.said, ', ') +
      '.';
  }

  /** Nothing to change is refused naming the fields it has. */
  private static void refuseNothingAsked(
    AgentSetupFields.Put put,
    Map<String, Object> lists,
    AgentSetupRecords.Found found
  ) {
    if (!put.fields.isEmpty() || !lists.isEmpty()) {
      return;
    }
    List<String> names = AgentSetupFields.namesOf(found.term);
    names.addAll(AgentRunsIn.namesOf(found.term));
    throw new ShoreshException(
      names.isEmpty()
        ? AgentSetupFields.aOrAn(found.kind) +
          ' has nothing to set but its name (rename_setup_record renames it).'
        : 'Say what to change (fields). Its fields: ' +
          String.join(names, ', ') +
          '.'
    );
  }
}
