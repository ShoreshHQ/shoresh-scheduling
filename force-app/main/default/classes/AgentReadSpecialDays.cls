/**
 * read_special_days: the season's special days and special events as the Special events screen
 * lists them, and where each is (docs/protocol/api.md API-1.73), through an agent or the command
 * line. Web address /v1/read_special_days, GET ?season=. Each week day a special day is on is
 * named with it ('Tuesday of "Week 1"', as the screen says it); a day that isn't named has none.
 * What a day has is what put_special_day_on_day and take_special_day_off_day take as seen.
 */
@RestResource(urlMapping='/v1/read_special_days')
global with sharing class AgentReadSpecialDays implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{ 'season' };

  @HttpGet
  global static void get() {
    AgentWeeks.answer(new AgentReadSpecialDays());
  }

  public String run() {
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(asked(), 'season')
    );
    CampLabels labels = CampLabels.forCamp(season.Camp__c);
    Map<Id, List<String>> placedAt = placedAt(season.Id);
    List<String> days = new List<String>();
    for (SpecialDay__c day : [
      SELECT Id, Name
      FROM SpecialDay__c
      WHERE Season__c = :season.Id
      WITH USER_MODE
      ORDER BY SortOrder__c, Name
    ]) {
      days.add(
        '"' +
          day.Name +
          '": ' +
          (placedAt.containsKey(day.Id)
            ? 'on ' + String.join(placedAt.get(day.Id), ', ')
            : 'not on a day')
      );
    }
    List<String> events = new List<String>();
    for (SpecialEvent__c event : [
      SELECT Id, Name
      FROM SpecialEvent__c
      WHERE Season__c = :season.Id
      WITH USER_MODE
      ORDER BY SortOrder__c, Name
    ]) {
      events.add(
        '"' +
          event.Name +
          '"' +
          (placedAt.containsKey(event.Id)
            ? ': on ' + String.join(placedAt.get(event.Id), ', ')
            : '')
      );
    }
    return 'The ' +
      labels.pluralInSentence('SpecialDay') +
      ' in ' +
      season.Name +
      ' (each replaces its day for the whole camp): ' +
      listed(days) +
      '. The ' +
      labels.pluralInSentence('SpecialEvent') +
      ' (placed on a week\'s cells with place_special_event): ' +
      listed(events) +
      '. A week day not named here has no ' +
      labels.singularInSentence('SpecialDay') +
      ': its seen is "none".';
  }

  /** The fields in the web address; one Shoresh doesn't know is refused. */
  private static Map<String, Object> asked() {
    Map<String, Object> asked = new Map<String, Object>();
    for (String key : RestContext.request.params.keySet()) {
      if (!FIELDS.contains(key)) {
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            key.left(40) +
            '". The fields are: season.'
        );
      }
      asked.put(key, RestContext.request.params.get(key));
    }
    return asked;
  }

  /** Each special day's and event's week days, as the screen says them ('Tuesday of "Week 1"'). */
  private static Map<Id, List<String>> placedAt(Id seasonId) {
    Map<Id, List<String>> result = new Map<Id, List<String>>();
    for (SpecialDates.Placement placed : SpecialDates.forSeason(seasonId)) {
      if (!result.containsKey(placed.itemId)) {
        result.put(placed.itemId, new List<String>());
      }
      result.get(placed.itemId)
        .add(SpecialDates.onDay(placed.day, placed.weekName));
    }
    return result;
  }

  private static String listed(List<String> said) {
    return said.isEmpty() ? 'none yet' : String.join(said, '; ');
  }
}
