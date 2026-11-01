/**
 * The setup record a person's AI names (docs/protocol/api.md API-1.47, API-1.48): one of the
 * kinds Camp Setup edits and deletes, found in the season by its kind (the model word, like
 * "group", or the camp's own, like "bunk") and its name, as camps type names. A name two programs
 * both use is asked about (program), never picked; a kind or name that isn't there is refused
 * naming the ones there are (API-1.25). Read in user mode: the person's own access.
 */
public with sharing class AgentSetupRecords {
  // The kinds Camp Setup renames and deletes, by model term, in the screen's order.
  private static final List<String> KINDS = new List<String>{
    'Week',
    'Program',
    'Division',
    'Group',
    'TimeBlock',
    'LocationType',
    'Location',
    'Activity',
    'FixedActivity',
    'RecurringActivity',
    'SpecialDay',
    'SpecialEvent',
    'ElectiveSet'
  };

  /** The record found: its Id and name, its kind in the camp's word, and the camp's words. */
  public class Found {
    public Id id;
    public String name;
    public String kind;
    public CampLabels labels;
  }

  /** The one record of that kind and name in the season (season, kind, name, program). */
  public static Found find(Map<String, Object> body) {
    AgentWeeks.requireScheduler();
    Season__c season = OutgoingRows.seasonCalled(
      AgentFields.text(body, 'season')
    );
    CampLabels labels = CampLabels.forCamp(
      [SELECT Camp__c FROM Season__c WHERE Id = :season.Id WITH USER_MODE]
      .Camp__c
    );
    String term = termOf(AgentFields.text(body, 'kind'), labels);
    String name = AgentFields.text(body, 'name');
    if (String.isBlank(name)) {
      throw new ShoreshException(
        'Say which ' + labels.singularInSentence(term) + ' (name).'
      );
    }
    SObject row = onlyOne(
      rowsOf(term, season.Id),
      body,
      new List<String>{
        labels.singularInSentence(term),
        labels.pluralInSentence(term)
      }
    );
    Found result = new Found();
    result.id = row.Id;
    result.name = (String) row.get('Name');
    result.kind = labels.singularInSentence(term);
    result.labels = labels;
    return result;
  }

  /** The model term the kind names, by the model's word or the camp's; refused otherwise. */
  private static String termOf(String kind, CampLabels labels) {
    String asked = IncomingBatch.fold(kind.replace('_', ' '));
    List<String> said = new List<String>();
    for (String term : KINDS) {
      String model = CampLabels.modelTermsOnly().singular(term);
      String own = labels.singular(term);
      if (
        asked == IncomingBatch.fold(model) ||
        asked == IncomingBatch.fold(own) ||
        asked == IncomingBatch.fold(term)
      ) {
        return term;
      }
      said.add(own.toLowerCase());
    }
    throw new ShoreshException(
      (String.isBlank(kind)
          ? 'Say what kind of thing it is (kind). '
          : 'Shoresh\'s setup has no kind "' + kind.left(40) + '". ') +
        'The kinds: ' +
        String.join(said, ', ') +
        '.'
    );
  }

  /** The records of that kind the season holds, each with its program when it has one. */
  private static List<SObject> rowsOf(String term, Id seasonId) {
    switch on term {
      when 'Week' {
        return [
          SELECT Id, Name
          FROM Week__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'Program' {
        return [
          SELECT Id, Name
          FROM Program__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'Division' {
        return [
          SELECT Id, Name, Program__r.Name
          FROM Division__c
          WHERE Program__r.Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'Group' {
        return [
          SELECT Id, Name, Division__r.Program__r.Name
          FROM Group__c
          WHERE Division__r.Program__r.Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'TimeBlock' {
        return [
          SELECT Id, Name, Program__r.Name
          FROM TimeBlock__c
          WHERE Program__r.Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'LocationType' {
        return [
          SELECT Id, Name
          FROM LocationType__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'Location' {
        return [
          SELECT Id, Name
          FROM Location__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'Activity' {
        return [
          SELECT Id, Name
          FROM Activity__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'FixedActivity' {
        return [
          SELECT Id, Name, Program__r.Name
          FROM FixedActivity__c
          WHERE Program__r.Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'RecurringActivity' {
        return [
          SELECT Id, Name, Program__r.Name
          FROM RecurringActivity__c
          WHERE Program__r.Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'SpecialDay' {
        return [
          SELECT Id, Name
          FROM SpecialDay__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when 'SpecialEvent' {
        return [
          SELECT Id, Name
          FROM SpecialEvent__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ];
      }
      when else {
        return [
          SELECT Id, Name
          FROM ElectiveSet__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          ORDER BY Name
        ];
      }
    }
  }

  /** The program a record sits in ('' for a season-wide kind). */
  private static String programOf(SObject row) {
    Schema.SObjectType kind = row.getSObjectType();
    SObject program;
    if (kind == Group__c.SObjectType) {
      SObject division = row.getSObject(Group__c.Division__c);
      program = division == null
        ? null
        : division.getSObject(Division__c.Program__c);
    } else if (kind == Division__c.SObjectType) {
      program = row.getSObject(Division__c.Program__c);
    } else if (kind == TimeBlock__c.SObjectType) {
      program = row.getSObject(TimeBlock__c.Program__c);
    } else if (kind == FixedActivity__c.SObjectType) {
      program = row.getSObject(FixedActivity__c.Program__c);
    } else if (kind == RecurringActivity__c.SObjectType) {
      program = row.getSObject(RecurringActivity__c.Program__c);
    }
    return program == null ? '' : (String) program.get('Name');
  }

  /**
   * The one row of that name (in that program, when one is named). Two programs' rows of the same
   * name are asked about, naming the programs; none is refused naming the ones there are.
   * words: the kind in the camp's words, singular then plural.
   */
  private static SObject onlyOne(
    List<SObject> rows,
    Map<String, Object> body,
    List<String> words
  ) {
    String name = AgentFields.text(body, 'name');
    String programName = AgentFields.text(body, 'program');
    List<SObject> found = new List<SObject>();
    List<String> names = new List<String>();
    List<String> programs = new List<String>();
    for (SObject row : rows) {
      String program = programOf(row);
      Boolean inProgram =
        String.isBlank(programName) ||
        IncomingBatch.fold(program) == IncomingBatch.fold(programName);
      if (!inProgram) {
        continue;
      }
      names.add((String) row.get('Name'));
      if (
        IncomingBatch.fold((String) row.get('Name')) == IncomingBatch.fold(name)
      ) {
        found.add(row);
        programs.add(program);
      }
    }
    if (found.size() == 1) {
      return found[0];
    }
    String kind = words[0];
    if (found.size() > 1) {
      throw new ShoreshException(
        'More than one ' +
          kind +
          ' is called "' +
          name.left(80) +
          '". Say which program (program): ' +
          String.join(programs, ', ') +
          '.'
      );
    }
    throw new ShoreshException(
      'There is no ' +
        kind +
        ' called "' +
        name.left(80) +
        '" that this user can see. ' +
        AgentWeeks.namesSaid(words[1], names)
    );
  }
}
