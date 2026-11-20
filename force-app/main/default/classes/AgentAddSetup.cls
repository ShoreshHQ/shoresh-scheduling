/**
 * add_to_setup: add one setup record to the season (a week, program, division, group, time
 * block, location type, location, activity, fixed or recurring activity, special day or event, or
 * elective set), as the person, through an agent or the command line (docs/protocol/api.md
 * API-1.50). Web address /v1/add_to_setup, POST {season, kind, name, program, fields}. It is
 * the setup table's own Add (SetupTablesController.saveRow with a new row): last in its table,
 * starting from what that table's new row starts with, and refused when it lacks what the table
 * requires before Add, or in the save's own words. A fixed activity over a recurring one asks
 * first what the table asks, and on the yes saves with the same pieces (API-1.147).
 */
@RestResource(urlMapping='/v1/add_to_setup')
global with sharing class AgentAddSetup implements AgentWeeks.Action, AgentAskFirst.Preview {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'kind',
    'name',
    'program',
    'fields'
  };

  // What the table needs before its Add (its required columns), by kind.
  private static final Map<String, List<String>> REQUIRED = new Map<String, List<String>>{
    'Week' => new List<String>{ 'start_date', 'end_date' },
    'Group' => new List<String>{ 'division' },
    'TimeBlock' => new List<String>{ 'start_time', 'end_time' },
    'FixedActivity' => new List<String>{ 'time_block' },
    'RecurringActivity' => new List<String>{ 'time_block' }
  };

  // The new row and its fields, read once for the question and the save.
  private String name;
  private AgentSetupRecords.Found found;
  private SObject record;
  private AgentSetupFields.Put put;
  private AgentFixedOver.Ask ask;

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentAddSetup());
  }

  /** CORE-3.9: the table's question when a fixed activity lands on a recurring one; else none. */
  public String preview() {
    ready();
    // The pieces too, unsaid: a recurring activity changed since makes the confirm stale.
    AgentAskFirst.stateIs(ask == null ? null : JSON.serialize(ask.around));
    return ask == null ? null : ask.words();
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
      // The setup table's own Add: one new row (ADR 0011).
      result = SetupTablesController.saveRow(record, null, put.extras);
    } catch (Exception e) {
      throw new ShoreshException(
        '"' + name + '" not added. ' + ScreenErrors.words(e)
      );
    }
    return 'Added the ' +
      found.kind +
      ' "' +
      name +
      '"' +
      (put.said.isEmpty() ? '' : ': ' + String.join(put.said, ', ')) +
      '.' +
      (ask == null ? '' : ' ' + ask.line);
  }

  /** The new row as the table starts it, with the fields asked; refused as the table refuses. */
  private void ready() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    found = AgentSetupRecords.kindIn(body);
    name = AgentFields.text(body, 'name');
    if (String.isBlank(name)) {
      throw new ShoreshException(
        'Say what to call the new ' + found.kind + ' (name).'
      );
    }
    refuseWhatIsMissing(found, AgentSetupFields.given(body.get('fields')));
    if (AgentSetupFields.inProgram(found.term)) {
      found.programId = programCalled(AgentFields.text(body, 'program'), found);
    }
    record = AgentSetupNewRow.of(found);
    record.put('Name', name);
    put = AgentSetupFields.put(record, body.get('fields'), found);
    AgentSetupNotes.refuseTooFewGroups(record, found.labels);
    ask = AgentFixedOver.of(record, put.extras, found);
  }

  /** What the table requires before Add, refused naming all of it. */
  private static void refuseWhatIsMissing(
    AgentSetupRecords.Found found,
    Map<String, Object> given
  ) {
    List<String> missing = new List<String>();
    for (
      String key : REQUIRED.containsKey(found.term)
        ? REQUIRED.get(found.term)
        : new List<String>()
    ) {
      if (!given.containsKey(key)) {
        missing.add(key);
      }
    }
    if (!missing.isEmpty()) {
      throw new ShoreshException(
        'A new ' +
          found.kind +
          ' needs these fields too: ' +
          String.join(missing, ', ') +
          (found.term == 'Group'
            ? ' ("none" for no ' +
              found.labels.singularInSentence('Division') +
              ')'
            : '') +
          '.'
      );
    }
  }

  /** The program the new record goes in: the one named, or the season's only one. */
  private static Id programCalled(String asked, AgentSetupRecords.Found found) {
    Id seasonId = found.seasonId;
    List<Program__c> programs = [
      SELECT Id, Name
      FROM Program__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c, Name
    ];
    List<String> names = new List<String>();
    for (Program__c program : programs) {
      names.add(program.Name);
      if (
        String.isNotBlank(asked) &&
        IncomingBatch.fold(program.Name) == IncomingBatch.fold(asked)
      ) {
        return program.Id;
      }
    }
    if (String.isBlank(asked) && programs.size() == 1) {
      return programs[0].Id;
    }
    String word = found.labels.singularInSentence('Program');
    throw new ShoreshException(
      (String.isBlank(asked)
        ? 'Say which ' + word + ' (program). '
        : 'There is no ' +
          word +
          ' called "' +
          asked.left(80) +
          '" that you can see. ') +
      AgentWeeks.namesSaid(found.labels.pluralInSentence('Program'), names)
    );
  }
}
