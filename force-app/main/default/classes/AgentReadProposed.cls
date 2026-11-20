/**
 * read_guessed_electives: the electives Camp Setup shows as guessed (a dashed edge and a
 * Confirm at the row's end), not yet confirmed, through an agent or the command line
 * (docs/protocol/api.md API-1.100). Web address /v1/read_guessed_electives, GET ?season=. Each is
 * said by its elective set and activity, as elective_looks_right takes it.
 */
@RestResource(urlMapping='/v1/read_guessed_electives')
global with sharing class AgentReadProposed implements AgentRequest.SentenceRead {
  @HttpGet
  global static void get() {
    AgentRequest.answer(new AgentReadProposed());
  }

  public Set<String> fields() {
    return new Set<String>{ 'season' };
  }

  public String run(Map<String, Object> asked) {
    Season__c season = AgentChangeCampWords.seasonOf(
      (String) asked.get('season')
    );
    CampLabels words = CampLabels.forCamp(season.Camp__c);
    List<String> said = new List<String>();
    for (Offering__c offering : [
      SELECT ElectiveSet__r.Name, Activity__r.Name
      FROM Offering__c
      WHERE ElectiveSet__r.Season__c = :season.Id AND Proposed__c = TRUE
      WITH USER_MODE
      ORDER BY ElectiveSet__r.Name, Activity__r.Name
    ]) {
      said.add(
        offering.Activity__r.Name +
          ' (' +
          words.singularInSentence('ElectiveSet') +
          ' ' +
          offering.ElectiveSet__r.Name +
          ')'
      );
    }
    if (said.isEmpty()) {
      return 'Nothing in "' +
        season.Name +
        '" is guessed: every ' +
        words.singularInSentence('Elective') +
        ' looks right.';
    }
    return 'Guessed in "' +
      season.Name +
      '" and not marked Looks right yet (Camp Setup shows each with Looks right; no camper gets a seat in it until then): ' +
      String.join(said, '; ') +
      '. To say one looks right, use elective_looks_right with seen "guessed".';
  }
}
