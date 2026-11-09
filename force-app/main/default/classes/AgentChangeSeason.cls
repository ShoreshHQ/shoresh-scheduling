/**
 * change_season: change the season itself (its name, its first and last day, its short-week choice),
 * as Camp Setup's season form saves it, through an agent or the command line (docs/protocol/api.md
 * API-1.57, API-1.142). Web address /v1/change_season, POST {season, fields: {name, start_date,
 * end_date, short_week}, seen}. It is the
 * form's own save (SeasonSetupController.saveRecords), the two dates sent together as the form
 * sends them, done only while each field changed still holds what the AI read in list_seasons
 * (the name with its capitals), with the season locked; otherwise refused (409), nothing saved.
 */
@RestResource(urlMapping='/v1/change_season')
global with sharing class AgentChangeSeason implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'fields',
    'seen'
  };
  private static final List<String> KEYS = new List<String>{
    'name',
    'start_date',
    'end_date',
    'short_week'
  };

  // The season's word in the camp's words, and the refusal's start, once the season is read.
  private String word;
  private String notSaved;

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentChangeSeason());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.requireScheduler();
    Id seasonId = OutgoingRows.seasonCalled(AgentFields.text(body, 'season'))
      .Id;
    Map<String, Object> given = AgentSetupFields.given(body.get('fields'));
    Map<String, Object> seen = AgentSetupFields.given(body.get('seen'));
    Season__c now = [
      SELECT Id, Name, Camp__c, StartDate__c, EndDate__c, ShrinkShortWeek__c
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
      FOR UPDATE
    ];
    word = CampLabels.forCamp(now.Camp__c).singularInSentence('Season');
    notSaved = '"' + now.Name + '" not saved. ';
    refuseUnknown(given);
    Season__c record = new Season__c(Id = seasonId);
    List<String> said = new List<String>();
    for (String key : KEYS) {
      if (given.containsKey(key)) {
        refuseChanged(key, seen, now);
        put(record, key, text(given.get(key)));
        said.add(key.replace('_', ' ') + ' ' + text(given.get(key)));
      }
    }
    AgentSeasonDates.together(record, given, now);
    try {
      // Camp Setup's own season form save.
      SeasonSetupController.saveRecords(new List<SObject>{ record });
    } catch (Exception e) {
      throw new ShoreshException(notSaved + ScreenErrors.words(e));
    }
    return 'Changed the ' +
      word +
      ' "' +
      now.Name +
      '": ' +
      String.join(said, ', ') +
      '.';
  }

  /** The field must still be what list_seasons said, the name with its capitals. */
  private void refuseChanged(
    String key,
    Map<String, Object> seen,
    Season__c now
  ) {
    if (!seen.containsKey(key)) {
      throw new ShoreshException(
        notSaved +
          'Say the ' +
          word +
          '\'s ' +
          key +
          ' as list_seasons gave it (seen), so a change someone made since isn\'t lost.'
      );
    }
    // "summer 2026" is not "Summer 2026" (Apex's == ignores case).
    // Compared as sent: a name's spaces count too.
    Object said = seen.get(key);
    String asSaid = said == null ? '' : String.valueOf(said);
    // keep and lower are words, not a name: any capitals or spaces read the same.
    if (key == 'short_week') {
      asSaid = asSaid.trim().toLowerCase();
    }
    if (!SeenSaves.value(shownNow(key, now), asSaid)) {
      throw new AgentWeeks.ConflictException(
        'Someone else changed the ' +
          word +
          ' "' +
          now.Name +
          '" since, so nothing was saved. Read it again in Shoresh.'
      );
    }
  }

  private void refuseUnknown(Map<String, Object> given) {
    Set<String> known = new Set<String>(KEYS);
    for (String key : given.keySet()) {
      if (!known.contains(key)) {
        throw new ShoreshException(
          notSaved +
            AgentSetupFields.aOrAn(word) +
            ' has no field "' +
            key.left(40) +
            '". Its fields: name, start_date, end_date, short_week.'
        );
      }
    }
    if (given.isEmpty()) {
      throw new ShoreshException(
        'Say what to change (fields): name, start_date, end_date, short_week.'
      );
    }
  }

  /** A field as list_seasons says it: the name, a date like 2026-07-06, keep or lower. */
  private static String shownNow(String key, Season__c now) {
    if (key == 'name') {
      return now.Name;
    }
    if (key == 'short_week') {
      return AgentSeasons.shortWeekOf(now);
    }
    Date day = key == 'start_date' ? now.StartDate__c : now.EndDate__c;
    return day == null ? '(blank)' : String.valueOf(day);
  }

  /** The form's two choices (WEEK-4.2): keep each activity's minimum, or lower it to the days. */
  private Boolean lowersOf(String asked) {
    String said = asked.toLowerCase();
    if (said != 'keep' && said != 'lower') {
      throw new ShoreshException(notSaved + 'Say keep or lower (short_week).');
    }
    return said == 'lower';
  }

  /** The form refuses a blank name or date; a date is read as list_seasons gives them. */
  private void put(Season__c record, String key, String asked) {
    if (String.isBlank(asked) || asked == '(blank)') {
      throw new ShoreshException(
        notSaved + 'Give the ' + key.replace('_', ' ') + '; it can\'t be blank.'
      );
    }
    if (key == 'name') {
      // An AI finds a season by name: a second of one name would lock it out of both (API-1.57).
      AgentCopySeason.refuseTaken(asked, record.Id);
      record.Name = asked;
      return;
    }
    if (key == 'short_week') {
      record.ShrinkShortWeek__c = lowersOf(asked);
      return;
    }
    Date day;
    try {
      day = Date.valueOf(asked);
    } catch (Exception e) {
      throw new ShoreshException(
        notSaved +
          'Give the ' +
          key.replace('_', ' ') +
          ' as a date like 2026-07-06.'
      );
    }
    record.put(
      key == 'start_date' ? Season__c.StartDate__c : Season__c.EndDate__c,
      day
    );
  }

  private static String text(Object value) {
    return value == null ? '' : String.valueOf(value).normalizeSpace();
  }
}
