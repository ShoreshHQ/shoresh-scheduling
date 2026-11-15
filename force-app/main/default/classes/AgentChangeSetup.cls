/**
 * change_setup_record: change fields of one of the season's setup records other than its name
 * (times, dates, days, places, limits, a group's division, the weeks it runs in, who a recurring
 * activity covers), as the person, through an agent or the
 * command line (docs/protocol/api.md API-1.49). Web address /v1/change_setup_record, POST {season,
 * kind, name, program, fields, seen}. Found as rename_setup_record finds it; it is the setup
 * table's own row save (SetupTablesController.saveRow) with what the agent read
 * (read_setup_record) sent as seen, so someone else's change since it read is refused, never
 * overwritten. Answered and refused in the save's own words. A fixed activity moved over a
 * recurring one asks first what the table asks, and on the yes saves with the same pieces
 * (API-1.147).
 */
@RestResource(urlMapping='/v1/change_setup_record')
global with sharing class AgentChangeSetup implements AgentWeeks.Action, AgentAskFirst.Preview {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'kind',
    'name',
    'program',
    'fields',
    'seen'
  };

  // The row and what was seen, read once for the question and the save.
  private AgentSetupRecords.Found found;
  private SObject record;
  private SObject seen;
  private AgentSetupFields.Put put;
  private AgentFixedOver.Ask ask;

  // For tests: the weeks' following refused, as trouble there would be (API-1.49).
  @TestVisible
  private static Exception weeksRefusedForTest;

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentChangeSetup());
  }

  /** CORE-3.9: the table's question when a fixed activity lands on a recurring one; else none. */
  public String preview() {
    ready();
    // The pieces too, unsaid: a recurring activity changed since makes the confirm stale.
    AgentAskFirst.stateIs(ask == null ? null : JSON.serialize(ask.around));
    return ask == null ? null : ask.words();
  }

  /** The row with the fields asked and what was seen; refused as the table refuses. */
  private void ready() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    found = AgentSetupRecords.find(body);
    record = found.id.getSObjectType().newSObject(found.id);
    Map<String, Object> given = AgentSetupFields.given(body.get('fields'));
    // The weeks it runs in and who it covers go with the row as its ticks (API-1.53, API-1.54).
    Map<String, Object> lists = AgentRunsIn.takeOut(given, found.term);
    put = AgentSetupFields.put(record, given, found);
    AgentSetupNotes.refuseTooFewGroups(record);
    refuseNothingAsked(put, lists, found);
    seen = AgentSetupFields.seen(found.id, body.get('seen'), put);
    if (!lists.isEmpty()) {
      put.said.addAll(AgentRunsIn.ready(lists, body.get('seen'), put));
    }
    ask = AgentFixedOver.of(record, put.extras, found);
  }

  public String run() {
    if (record == null) {
      ready();
    }
    if (ask != null) {
      // The yes: the recurring activities keep their other time blocks, as on screen.
      put.extras.around = ask.around;
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
      '.' +
      (ask == null ? '' : ' ' + ask.line) +
      weeksFollow(record, found.labels);
  }

  /**
   * A program's days changed: the weeks follow them, as on the Programs screen, and the answer
   * says so (WEEK-2.7, ADR 0028); nothing more when no week moved. As on the screen, a separate
   * step after the save: if the weeks can't follow, the new days stay saved and the answer says
   * the weeks didn't follow, with why (API-1.49).
   */
  private static String weeksFollow(SObject record, CampLabels labels) {
    if (record.getSObjectType() != Program__c.SObjectType) {
      return '';
    }
    Boolean daysChanged = false;
    for (String day : SetTimePlan.WEEKDAYS) {
      Schema.SObjectField field = SetTimePlan.dayField(
        Program__c.SObjectType,
        day
      );
      daysChanged |= record.isSet(field);
    }
    if (!daysChanged) {
      return '';
    }
    Program__c program = [
      SELECT Season__c
      FROM Program__c
      WHERE Id = :record.Id
      WITH USER_MODE
    ];
    Savepoint before = Database.setSavepoint();
    SeasonWeeksFollow.Followed followed;
    try {
      if (weeksRefusedForTest != null) {
        throw weeksRefusedForTest;
      }
      followed = SeasonWeeksFollow.followProgramDays(program.Season__c);
    } catch (Exception e) {
      Database.rollback(before);
      return ' The ' +
        labels.pluralInSentence('Week') +
        ' didn\'t follow the new days. ' +
        ScreenErrors.words(e);
    }
    return followed.said == null ? '' : ' ' + followed.said;
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
