/**
 * read_failed_sends: the sends to a saved destination that failed, as Settings shows them,
 * through an agent or the command line (docs/protocol/api.md API-1.91, API-1.92). Web address
 * /v1/read_failed_sends, GET ?season=. The screen's own list (SendLog.failedLast, as
 * SeasonSetupReader gives Settings): the last send of each thing to each destination, where it
 * failed, in its own sentence. Settings offers nothing else for sends (no retry, no dismiss: a
 * failed send stays until one goes through), and a destination is a Named Credential the camp's
 * admin keeps in Salesforce Setup, so its address and secrets are never read here; a web address
 * in a sentence is left out of the answer.
 */
@RestResource(urlMapping='/v1/read_failed_sends')
global with sharing class AgentReadFailedSends implements AgentWeeks.Action {
  // Any web address, so a destination's address (and anything in it) never reaches an AI.
  private static final Pattern WEB_ADDRESS = Pattern.compile(
    '(?i)\\b(https?|callout):\\S*'
  );

  @HttpGet
  global static void get() {
    AgentWeeks.answer(new AgentReadFailedSends());
  }

  public String run() {
    for (String key : RestContext.request.params.keySet()) {
      if (!'season'.equals(key)) {
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
    for (String failed : SendLog.failedLast(season.Id)) {
      said.add(withoutAddresses(failed));
    }
    if (said.isEmpty()) {
      return 'No send from "' +
        season.Name +
        '" is failing: the last send of each thing to each destination went through, or nothing was sent.';
    }
    return 'Sends from "' +
      season.Name +
      '" that failed, each the last of its thing to its destination, as Settings shows them (each stays until one goes through; the camp\'s own Flow sends again): ' +
      String.join(said, '; ');
  }

  /** The sentence with any web address left out (API-1.92). */
  public static String withoutAddresses(String sentence) {
    return WEB_ADDRESS.matcher(sentence).replaceAll('(a web address)');
  }
}
