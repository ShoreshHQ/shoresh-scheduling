/**
 * change_camp_words: change the camp's own words for Shoresh's terms, as Camp Setup's Camp words
 * screen saves them, through an agent or the command line (docs/protocol/api.md API-1.56). Web
 * address /v1/change_camp_words, POST {season, words, seen}: words and seen by Shoresh's word
 * ("Group"), each "singular / plural", or (blank) for Shoresh's own word. It is the screen's own
 * save (SeasonSetupController.saveCampLabels), done only while each word changed is still what the
 * AI read, capitals and all, with the camp's words locked; otherwise refused (409), nothing saved.
 */
@RestResource(urlMapping='/v1/change_camp_words')
global with sharing class AgentChangeCampWords implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'words',
    'seen'
  };
  private static final String NOT_SAVED = 'Camp words not saved. ';

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentChangeCampWords());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    Season__c season = seasonOf(AgentFields.text(body, 'season'));
    Map<String, Object> words = AgentSetupFields.given(body.get('words'));
    if (words.isEmpty()) {
      throw new ShoreshException(
        'Say which words to change (words), like {"Group": "Bunk / Bunks"}.'
      );
    }
    Map<String, Object> seen = AgentSetupFields.given(body.get('seen'));
    // Locked: no one else's save of these words can come between the compare and the save.
    lock(season.Camp__c);
    List<CampLabels.TermLabel> all = CampLabels.forCamp(season.Camp__c).all();
    List<CampLabels.TermLabel> changed = new List<CampLabels.TermLabel>();
    List<String> said = new List<String>();
    for (String key : words.keySet()) {
      CampLabels.TermLabel row = termOf(key, all);
      refuseChanged(row, seen, key);
      put(row, String.valueOf(words.get(key)));
      changed.add(row);
      said.add(row.modelSingular + ': ' + shown(row));
    }
    try {
      // Camp Setup's own Camp words save.
      SeasonSetupController.saveCampLabels(season.Camp__c, changed);
    } catch (Exception e) {
      throw new ShoreshException(NOT_SAVED + ScreenErrors.words(e));
    }
    return 'Changed the camp words of "' +
      season.Camp__r.Name +
      '": ' +
      String.join(said, '; ') +
      '.';
  }

  /** The word must still be what the agent read, capitals and all. */
  private static void refuseChanged(
    CampLabels.TermLabel row,
    Map<String, Object> seen,
    String key
  ) {
    if (!seen.containsKey(key)) {
      throw new ShoreshException(
        NOT_SAVED +
          'Say what "' +
          row.modelSingular +
          '" was when you read it with read_camp_words (seen).'
      );
    }
    // Capitals count: "bunk / bunks" is not "Bunk / Bunks" (Apex's == ignores case).
    if (!shown(row).equals(String.valueOf(seen.get(key)).normalizeSpace())) {
      throw new AgentWeeks.ConflictException(
        'Someone else changed the camp\'s word for "' +
          row.modelSingular +
          '" since, so nothing was saved. Read it again in Shoresh.'
      );
    }
  }

  /** The season named (or the one the screens open on), with its camp. */
  public static Season__c seasonOf(String name) {
    AgentWeeks.requireScheduler();
    Id seasonId = OutgoingRows.seasonCalled(name).Id;
    return [
      SELECT Id, Camp__c, Camp__r.Name
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ];
  }

  /** A word as the screen shows it: "Bunk / Bunks". */
  public static String shown(CampLabels.TermLabel row) {
    return row.singular + ' / ' + row.plural;
  }

  private static void lock(Id campId) {
    List<CampLabel__c> labels = [
      SELECT Id
      FROM CampLabel__c
      WHERE Camp__c = :campId
      WITH USER_MODE
      FOR UPDATE
    ];
    labels.clear();
  }

  /** The term a key names: Shoresh's word for it, its plural, or the camp's own word. */
  private static CampLabels.TermLabel termOf(
    String key,
    List<CampLabels.TermLabel> all
  ) {
    String asked = IncomingBatch.fold(key);
    // Shoresh's own words first: a camp word never hides one of them.
    for (CampLabels.TermLabel row : all) {
      if (
        asked == IncomingBatch.fold(row.term) ||
        asked == IncomingBatch.fold(row.modelSingular) ||
        asked == IncomingBatch.fold(row.modelPlural)
      ) {
        return row;
      }
    }
    for (CampLabels.TermLabel row : all) {
      if (asked == IncomingBatch.fold(row.singular)) {
        return row;
      }
    }
    throw new ShoreshException(
      NOT_SAVED +
        'Shoresh has no word "' +
        key.left(40) +
        '". Read them with read_camp_words.'
    );
  }

  /** The word asked: "singular / plural", or (blank) for Shoresh's own word. */
  private static void put(CampLabels.TermLabel row, String asked) {
    String text = asked == null ? '' : asked.normalizeSpace();
    if (text == '(blank)' || text == '') {
      row.singular = '';
      row.plural = '';
      return;
    }
    List<String> parts = text.split(' / ');
    if (
      parts.size() != 2 ||
      String.isBlank(parts[0]) ||
      String.isBlank(parts[1])
    ) {
      throw new ShoreshException(
        NOT_SAVED +
          'Give "' +
          row.modelSingular +
          '" both a singular and a plural word, like "Bunk / Bunks", or (blank) for Shoresh\'s own.'
      );
    }
    row.singular = parts[0].trim();
    row.plural = parts[1].trim();
  }
}
