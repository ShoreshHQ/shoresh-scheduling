/**
 * copy_season: copy a season to a new one, as Camp Setup's Copy season page does, through an agent
 * or the command line (docs/protocol/api.md API-1.62). Web address /v1/copy_season,
 * POST {season, name, start_date, seen}. It is the page's own Copy
 * (SeasonSetupController.copySeason), done only while the copy's dates are still the ones
 * read_season_copy said (seen), with the season locked; otherwise refused (409), nothing saved.
 * The season copied is only read, never changed.
 */
@RestResource(urlMapping='/v1/copy_season')
global with sharing class AgentCopySeason implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'name',
    'start_date',
    'seen'
  };
  // The whole season's dates, beside each week's.
  public static final String WHOLE = 'season';

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentCopySeason());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(body, 'season')
    );
    String name = AgentFields.text(body, 'name').normalizeSpace();
    Date start = dateOf(AgentFields.text(body, 'start_date'));
    Map<String, Object> seen = AgentSetupFields.given(body.get('seen'));
    if (seen.isEmpty()) {
      throw new ShoreshException(
        'Send the dates read_season_copy said as seen, so a change someone made since isn\'t copied unseen.'
      );
    }
    lock(season.Id);
    refuseTaken(name);
    Map<String, String> now;
    try {
      now = seenOf(SeasonSetupController.previewCopy(season.Id, start));
    } catch (Exception e) {
      throw new ShoreshException(ScreenErrors.words(e));
    }
    if (!sameAs(now, seen)) {
      throw new AgentWeeks.ConflictException(
        'Someone changed "' +
          season.Name +
          '" since, so nothing was copied. Read the copy again with read_season_copy.'
      );
    }
    try {
      // The Copy season page's own Copy.
      SeasonSetupController.copySeason(season.Id, name, start);
    } catch (Exception e) {
      throw new ShoreshException(
        '"' + season.Name + '" not copied. ' + ScreenErrors.words(e)
      );
    }
    return 'Copied "' +
      season.Name +
      '" to "' +
      name +
      '", ' +
      now.get(WHOLE) +
      '. "' +
      season.Name +
      '" itself is unchanged.';
  }

  /** The copy's dates: the whole season's, then each week's, by name, as start to end. */
  public static Map<String, String> seenOf(SeasonCopier.Preview preview) {
    Map<String, String> result = new Map<String, String>{
      WHOLE => span(preview.startDate, preview.endDate)
    };
    for (SeasonCopier.PreviewWeek week : preview.weeks) {
      result.put(week.name, span(week.startDate, week.endDate));
    }
    return result;
  }

  /** A date as list_seasons gives them, like 2027-06-28; refused otherwise. */
  public static Date dateOf(String asked) {
    try {
      return Date.valueOf(asked.trim());
    } catch (Exception e) {
      throw new ShoreshException(
        'Give the new first day (start_date) as a date like 2027-06-28.'
      );
    }
  }

  private static String span(Date first, Date last) {
    return String.valueOf(first) + ' to ' + String.valueOf(last);
  }

  /** Every date as read, by the same names, capitals and all; none added or gone. */
  private static Boolean sameAs(
    Map<String, String> now,
    Map<String, Object> seen
  ) {
    if (now.size() != seen.size()) {
      return false;
    }
    for (String key : now.keySet()) {
      Object said = seen.get(key);
      if (said == null || !now.get(key).equals(String.valueOf(said))) {
        return false;
      }
    }
    return true;
  }

  /**
   * A name a season the person sees already has is refused: the AI, and every season named
   * after it, could no longer tell the two apart (OutgoingRows.seasonCalled).
   */
  private static void refuseTaken(String name) {
    if (String.isBlank(name)) {
      return; // The page's own Copy says to give it a name.
    }
    if (
      ![SELECT Id FROM Season__c WHERE Name = :name WITH USER_MODE LIMIT 1]
        .isEmpty()
    ) {
      throw new ShoreshException(
        'There is already a season called "' +
          name.left(80) +
          '". Give the new one another name.'
      );
    }
  }

  /** Locked: no week can be added, moved or taken out between the compare and the copy. */
  private static Integer lock(Id seasonId) {
    return [
        SELECT Id
        FROM Season__c
        WHERE Id = :seasonId
        WITH USER_MODE
        FOR UPDATE
      ]
      .size();
  }
}
