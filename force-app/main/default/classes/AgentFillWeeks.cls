/**
 * fill_in_weeks: Camp Setup's "Fill in weeks" through an agent or the command line
 * (docs/protocol/api.md API-1.52): an empty season gets weeks covering its dates, on the days its
 * programs run. Web address /v1/fill_in_weeks, POST {season, seen: {start_date, end_date}}. It is
 * the screen's own (SeasonSetupController.addWeeksFromSeasonDates), done only while the season's
 * dates are still what the AI read in list_seasons; otherwise refused (409) with nothing added.
 */
@RestResource(urlMapping='/v1/fill_in_weeks')
global with sharing class AgentFillWeeks implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{ 'season', 'seen' };
  private static final List<String> DATES = new List<String>{
    'start_date',
    'end_date'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentFillWeeks());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.requireScheduler();
    Id seasonId = OutgoingRows.seasonCalled(AgentFields.text(body, 'season'))
      .Id;
    Map<String, Object> seen = AgentSetupFields.given(body.get('seen'));
    List<String> missing = new List<String>();
    for (String key : DATES) {
      if (!seen.containsKey(key)) {
        missing.add(key);
      }
    }
    if (!missing.isEmpty()) {
      throw new ShoreshException(
        'Say the season\'s dates as list_seasons gave them (seen: ' +
          String.join(missing, ', ') +
          '), so dates someone changed since aren\'t used.'
      );
    }
    Season__c season = [
      SELECT Name, Camp__c, StartDate__c, EndDate__c
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
      FOR UPDATE
    ];
    CampLabels labels = CampLabels.forCamp(season.Camp__c);
    if (
      !sameDate(seen.get('start_date'), season.StartDate__c) ||
      !sameDate(seen.get('end_date'), season.EndDate__c)
    ) {
      throw new AgentWeeks.ConflictException(
        'Someone else changed the dates of "' +
          season.Name +
          '" since, so nothing was added. Read it again in Shoresh.'
      );
    }
    try {
      // Camp Setup's own "Fill in weeks".
      SeasonSetupController.addWeeksFromSeasonDates(seasonId);
    } catch (Exception e) {
      throw new ShoreshException(
        'No ' +
          labels.pluralInSentence('Week') +
          ' added. ' +
          ScreenErrors.words(e)
      );
    }
    List<String> said = new List<String>();
    for (Week__c week : [
      SELECT Name, StartDate__c, EndDate__c
      FROM Week__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY StartDate__c, SortOrder__c
    ]) {
      said.add(
        week.Name +
          ' (' +
          String.valueOf(week.StartDate__c) +
          ' to ' +
          String.valueOf(week.EndDate__c) +
          ')'
      );
    }
    return 'Added ' +
      said.size() +
      ' ' +
      (said.size() == 1
        ? labels.singularInSentence('Week')
        : labels.pluralInSentence('Week')) +
      ' from the dates of "' +
      season.Name +
      '": ' +
      String.join(said, ', ') +
      '.';
  }

  /** A date as list_seasons gave it (2026-07-06), the same as the season's; blank as blank. */
  private static Boolean sameDate(Object said, Date now) {
    String text = said == null ? '' : String.valueOf(said).trim();
    if (String.isBlank(text) || text == '(blank)') {
      return now == null;
    }
    try {
      return Date.valueOf(text) == now;
    } catch (Exception e) {
      throw new ShoreshException(
        'Give the season\'s dates as dates like 2026-07-06.'
      );
    }
  }
}
