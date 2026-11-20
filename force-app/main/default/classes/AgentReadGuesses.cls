/**
 * read_setup_guesses: what the setup screens mark as guessed from a file and no one has said looks
 * right or changed since (ADR 0006 §21), through an agent or the command line
 * (docs/protocol/api.md API-1.59). Web address /v1/read_setup_guesses, GET ?season=. Each guess is
 * said with its value now, as mark_looks_right takes it back as seen.
 */
@RestResource(urlMapping='/v1/read_setup_guesses')
global with sharing class AgentReadGuesses implements AgentRequest.SentenceRead {
  @HttpGet
  global static void get() {
    AgentRequest.answer(new AgentReadGuesses());
  }

  public Set<String> fields() {
    return new Set<String>{ 'season' };
  }

  public String run(Map<String, Object> asked) {
    Season__c season = AgentChangeCampWords.seasonOf(
      (String) asked.get('season')
    );
    List<String> said = new List<String>();
    for (
      AgentGuesses.Entry entry : AgentGuesses.standing(
        season.Id,
        CampLabels.forCamp(season.Camp__c)
      )
    ) {
      said.add(entry.said());
    }
    if (said.isEmpty()) {
      return 'Nothing in "' +
        season.Name +
        '" is marked as guessed from a file: everything has been looked at or changed.';
    }
    return 'Guessed from a file in "' +
      season.Name +
      '" and still marked on Camp Setup (no one has said it looks right or changed it): ' +
      String.join(said, '; ') +
      '. To say one looks right, use mark_looks_right with its value as seen; to change one instead, use change_in_setup.';
  }
}
