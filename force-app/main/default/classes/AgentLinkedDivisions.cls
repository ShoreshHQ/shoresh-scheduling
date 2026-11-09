/**
 * The divisions a person's AI names on a linked choice (docs/protocol/api.md API-1.132, API-1.133),
 * as the linked choices editor's chips offer them: where the set sits, else every one of the
 * season, and any it names already. A name two programs share is asked about, never picked. Read
 * in user mode: the person's own access.
 */
public with sharing class AgentLinkedDivisions {
  private AgentLinkedChoiceRefs refs;

  public AgentLinkedDivisions(AgentLinkedChoiceRefs refs) {
    this.refs = refs;
  }

  /** The divisions the editor's chips offer: where the set sits, else every one of the season. */
  public List<Division__c> offered() {
    Set<Id> there = new Set<Id>();
    for (LinkedChoicePlaces.Cell cell : refs.places().cells) {
      there.addAll(cell.divisionIds);
    }
    List<Division__c> result = new List<Division__c>();
    for (Division__c each : divisions()) {
      if (there.isEmpty() || there.contains(each.Id)) {
        result.add(each);
      }
    }
    return result;
  }

  /** The divisions a linked choice names now. */
  public List<Division__c> namedBy(LinkedChoice__c choice) {
    Set<Id> named = new Set<Id>();
    if (choice != null) {
      for (Coverage__c row : choice.Coverages__r) {
        named.add(row.Division__c);
      }
    }
    List<Division__c> result = new List<Division__c>();
    for (Division__c each : divisions()) {
      if (named.contains(each.Id)) {
        result.add(each);
      }
    }
    return result;
  }

  /** The season's divisions; a holding record is no division (DIV-1.1). */
  private List<Division__c> divisions() {
    return [
      SELECT Id, Name, Program__r.Name
      FROM Division__c
      WHERE Program__r.Season__c = :refs.season.Id AND NoDivision__c = FALSE
      WITH USER_MODE
      ORDER BY Program__r.Name, Name
    ];
  }

  /** The divisions named (text, or {name, program}), each one of those offered. */
  public List<Id> idsOf(List<Object> asked, List<Division__c> offered) {
    List<Id> result = new List<Id>();
    for (Object each : asked) {
      result.add(idOf(each, offered));
    }
    return result;
  }

  private Id idOf(Object asked, List<Division__c> offered) {
    Map<String, Object> said = asked instanceof Map<String, Object>
      ? (Map<String, Object>) asked
      : new Map<String, Object>{
          'name' => asked instanceof String ? asked : ''
        };
    String name = AgentFields.text(said, 'name');
    String program = AgentFields.text(said, 'program');
    List<Division__c> found = new List<Division__c>();
    List<String> programs = new List<String>();
    for (Division__c each : offered) {
      if (isNamed(each, name, program)) {
        found.add(each);
        programs.add(each.Program__r.Name);
      }
    }
    if (found.size() == 1) {
      return found[0].Id;
    }
    programs.sort();
    throw new ShoreshException(
      found.isEmpty()
        ? refs.electiveSet.Name +
          ' has no ' +
          refs.labels.singularInSentence('Division') +
          ' "' +
          name.left(80) +
          '" to choose here.' +
          ' Nothing was changed.'
        : String.join(programs, ' and ') +
          ' both have a ' +
          refs.labels.singularInSentence('Division') +
          ' called "' +
          name.left(80) +
          '", so Shoresh can\'t tell which you mean ({"name", "program"} says whose).' +
          ' Nothing was changed.'
    );
  }

  private static Boolean isNamed(
    Division__c division,
    String name,
    String program
  ) {
    return IncomingBatch.fold(division.Name) == IncomingBatch.fold(name) &&
      (String.isBlank(program) ||
      IncomingBatch.fold(division.Program__r.Name) ==
      IncomingBatch.fold(program));
  }
}
