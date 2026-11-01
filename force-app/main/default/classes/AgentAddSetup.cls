/**
 * add_setup_record: add one setup record to the season (a week, program, division, group, time
 * block, location type, location, activity, fixed or recurring activity, special day or event, or
 * elective set), as the person, through an agent or the command line (docs/protocol/api.md
 * API-1.50). Web address /v1/add_setup_record, POST {season, kind, name, program, fields}. It is
 * the setup table's own Add (SetupTablesController.saveRow with a new row): last in its table,
 * starting from what that table's new row starts with, and refused when it lacks what the table
 * requires before Add, or in the save's own words.
 */
@RestResource(urlMapping='/v1/add_setup_record')
global with sharing class AgentAddSetup implements AgentWeeks.Action {
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

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentAddSetup());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentSetupRecords.Found found = AgentSetupRecords.kindIn(body);
    String name = AgentFields.text(body, 'name');
    if (String.isBlank(name)) {
      throw new ShoreshException(
        'Say what to call the new ' + found.kind + ' (name).'
      );
    }
    refuseWhatIsMissing(found, AgentSetupFields.given(body.get('fields')));
    if (AgentSetupFields.inProgram(found.term)) {
      found.programId = programCalled(AgentFields.text(body, 'program'), found);
    }
    SObject record = newRow(found);
    record.put('Name', name);
    AgentSetupFields.Put put = AgentSetupFields.put(
      record,
      body.get('fields'),
      found
    );
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
      '.';
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
          '" that this user can see. ') +
      AgentWeeks.namesSaid(found.labels.pluralInSentence('Program'), names)
    );
  }

  /**
   * The table's new row: in its season or program, last in order, with what that table's new row
   * starts with (shoreshCampSetup and shoreshProgram's defaults).
   */
  private static SObject newRow(AgentSetupRecords.Found found) {
    Id seasonId = found.seasonId;
    Id programId = found.programId;
    switch on found.term {
      when 'Week' {
        return new Week__c(
          Season__c = seasonId,
          SortOrder__c = next(
            [
              SELECT SortOrder__c
              FROM Week__c
              WHERE Season__c = :seasonId
              WITH USER_MODE
            ],
            Week__c.SortOrder__c
          )
        );
      }
      when 'Program' {
        List<Program__c> others = [
          SELECT
            SortOrder__c,
            Monday__c,
            Tuesday__c,
            Wednesday__c,
            Thursday__c,
            Friday__c,
            Saturday__c,
            Sunday__c
          FROM Program__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
        ];
        Program__c program = new Program__c(
          Season__c = seasonId,
          SortOrder__c = next(others, Program__c.SortOrder__c)
        );
        // The days the camp's other programs run; Monday to Friday for the first one.
        for (String day : AgentSetupFields.days()) {
          Schema.SObjectField field = AgentSetupFields.fieldOf('Program', day);
          Boolean runs = false;
          for (Program__c other : others) {
            runs = runs || other.get(field) == true;
          }
          program.put(field, others.isEmpty() ? !day.startsWith('s') : runs);
        }
        return program;
      }
      when 'Division' {
        return new Division__c(
          Program__c = programId,
          SortOrder__c = next(
            [
              SELECT SortOrder__c
              FROM Division__c
              WHERE Program__c = :programId
              WITH USER_MODE
            ],
            Division__c.SortOrder__c
          )
        );
      }
      when 'Group' {
        return new Group__c(
          Availability__c = 'AllDay',
          SortOrder__c = next(
            [
              SELECT SortOrder__c
              FROM Group__c
              WHERE Division__r.Program__c = :programId
              WITH USER_MODE
            ],
            Group__c.SortOrder__c
          )
        );
      }
      when 'TimeBlock' {
        return new TimeBlock__c(
          Program__c = programId,
          SortOrder__c = next(
            [
              SELECT SortOrder__c
              FROM TimeBlock__c
              WHERE Program__c = :programId
              WITH USER_MODE
            ],
            TimeBlock__c.SortOrder__c
          )
        );
      }
      when 'LocationType' {
        return new LocationType__c(
          Season__c = seasonId,
          SortOrder__c = next(
            [
              SELECT SortOrder__c
              FROM LocationType__c
              WHERE Season__c = :seasonId
              WITH USER_MODE
            ],
            LocationType__c.SortOrder__c
          )
        );
      }
      when 'Location' {
        return new Location__c(
          Season__c = seasonId,
          GroupsThatFit__c = 1,
          SortOrder__c = next(
            [
              SELECT SortOrder__c
              FROM Location__c
              WHERE Season__c = :seasonId
              WITH USER_MODE
            ],
            Location__c.SortOrder__c
          )
        );
      }
      when 'Activity' {
        // Defaults for an activity added by hand (Greg, 2026-10-16).
        return new Activity__c(
          Season__c = seasonId,
          Length__c = 1,
          TimesPerWeekMin__c = 1,
          TimesPerWeekMax__c = 1,
          Priority__c = 'Low',
          Outdoor__c = false,
          GroupsAtOnce__c = 1,
          NoWeeklyMax__c = false,
          NoGroupLimit__c = false,
          SortOrder__c = next(
            [
              SELECT SortOrder__c
              FROM Activity__c
              WHERE Season__c = :seasonId
              WITH USER_MODE
            ],
            Activity__c.SortOrder__c
          )
        );
      }
      when 'FixedActivity' {
        return new FixedActivity__c(
          Program__c = programId,
          Length__c = 1,
          SortOrder__c = next(
            [
              SELECT SortOrder__c
              FROM FixedActivity__c
              WHERE Program__c = :programId
              WITH USER_MODE
            ],
            FixedActivity__c.SortOrder__c
          )
        );
      }
      when 'RecurringActivity' {
        // No day ticked: the scheduler ticks at least one (Greg, 2026-10-16).
        return new RecurringActivity__c(
          Program__c = programId,
          Length__c = 1,
          Monday__c = false,
          Tuesday__c = false,
          Wednesday__c = false,
          Thursday__c = false,
          Friday__c = false,
          Saturday__c = false,
          Sunday__c = false,
          SortOrder__c = next(
            [
              SELECT SortOrder__c
              FROM RecurringActivity__c
              WHERE Program__c = :programId
              WITH USER_MODE
            ],
            RecurringActivity__c.SortOrder__c
          )
        );
      }
      when 'SpecialDay' {
        return new SpecialDay__c(
          Season__c = seasonId,
          SortOrder__c = next(
            [
              SELECT SortOrder__c
              FROM SpecialDay__c
              WHERE Season__c = :seasonId
              WITH USER_MODE
            ],
            SpecialDay__c.SortOrder__c
          )
        );
      }
      when 'SpecialEvent' {
        return new SpecialEvent__c(
          Season__c = seasonId,
          SortOrder__c = next(
            [
              SELECT SortOrder__c
              FROM SpecialEvent__c
              WHERE Season__c = :seasonId
              WITH USER_MODE
            ],
            SpecialEvent__c.SortOrder__c
          )
        );
      }
      when else {
        return new ElectiveSet__c(Season__c = seasonId);
      }
    }
  }

  /** After the last row: one more than the highest, so rows keep their order (the table's). */
  private static Decimal next(
    List<SObject> rows,
    Schema.SObjectField sortOrder
  ) {
    Decimal highest;
    for (SObject row : rows) {
      Decimal order = (Decimal) row.get(sortOrder);
      if (order != null && (highest == null || order > highest)) {
        highest = order;
      }
    }
    return highest == null ? rows.size() + 1 : highest + 1;
  }
}
