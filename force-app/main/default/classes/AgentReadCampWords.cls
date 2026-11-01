/**
 * read_camp_words: the camp's own words for Shoresh's terms, as Camp Setup's Camp words screen
 * shows them, through an agent or the command line (docs/protocol/api.md API-1.56). Web address
 * /v1/read_camp_words, GET ?season=. Each word is said as change_camp_words takes it back as seen
 * ("Bunk / Bunks"), and why this person can't change them, when they can't.
 */
@RestResource(urlMapping='/v1/read_camp_words')
global with sharing class AgentReadCampWords implements AgentWeeks.Action {
  @HttpGet
  global static void get() {
    AgentWeeks.answer(new AgentReadCampWords());
  }

  public String run() {
    for (String key : RestContext.request.params.keySet()) {
      if (key != 'season') {
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            key.left(40) +
            '". The fields are: season.'
        );
      }
    }
    Season__c season = AgentChangeCampWords.seasonOf(
      RestContext.request.params.get('season')
    );
    List<String> said = new List<String>();
    for (CampLabels.TermLabel row : CampLabels.forCamp(season.Camp__c).all()) {
      said.add(row.modelSingular + ': ' + AgentChangeCampWords.shown(row));
    }
    String blocked = SeasonSetupController.campWordsBlockedReason(
      season.Camp__c
    );
    return 'The camp words of "' +
      season.Camp__r.Name +
      '" (Shoresh\'s word: the camp\'s singular / plural): ' +
      String.join(said, '; ') +
      '. ' +
      (blocked == null
        ? 'Send the ones you change back as seen, by the same names.'
        : blocked);
  }
}
