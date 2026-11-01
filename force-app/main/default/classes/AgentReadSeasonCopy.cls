/**
 * read_season_copy: what Camp Setup's Copy season page shows before a copy, through an agent or
 * the command line (docs/protocol/api.md API-1.61). Web address /v1/read_season_copy,
 * GET ?season=&start_date=. It is the page's own preview (SeasonSetupController.previewCopy): the
 * new season's first and last day, a first day on another weekday said, and each week's dates now
 * and in the copy, said as copy_season takes them back as seen.
 */
@RestResource(urlMapping='/v1/read_season_copy')
global with sharing class AgentReadSeasonCopy implements AgentWeeks.Action {
  @HttpGet
  global static void get() {
    AgentWeeks.answer(new AgentReadSeasonCopy());
  }

  public String run() {
    for (String key : RestContext.request.params.keySet()) {
      if (key != 'season' && key != 'start_date') {
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            key.left(40) +
            '". The fields are: season, start_date.'
        );
      }
    }
    Season__c season = AgentChangeCampWords.seasonOf(
      RestContext.request.params.get('season')
    );
    Date start = AgentCopySeason.dateOf(
      RestContext.request.params.get('start_date')
    );
    SeasonCopier.Preview preview;
    try {
      // The Copy season page's own preview.
      preview = SeasonSetupController.previewCopy(season.Id, start);
    } catch (Exception e) {
      throw new ShoreshException(ScreenErrors.words(e));
    }
    CampLabels labels = CampLabels.forCamp(season.Camp__c);
    Map<String, String> seen = AgentCopySeason.seenOf(preview);
    List<String> said = new List<String>();
    for (String key : seen.keySet()) {
      said.add(key + ': ' + seen.get(key));
    }
    return 'A copy of "' +
      season.Name +
      '" starting ' +
      String.valueOf(start) +
      ' (' +
      preview.newWeekday +
      ') would run ' +
      String.join(said, '; ') +
      '.' +
      (preview.weekdaysChange
        ? ' "' +
          season.Name +
          '" started on a ' +
          preview.oldWeekday +
          ', so its ' +
          labels.pluralInSentence('Week') +
          ' land on other weekdays.'
        : '') +
      ' Its setup comes along (' +
      labels.pluralInSentence('Week') +
      ', ' +
      labels.pluralInSentence('Program') +
      ', ' +
      labels.pluralInSentence('Division') +
      ', ' +
      labels.pluralInSentence('Group') +
      ', ' +
      labels.pluralInSentence('Location') +
      ', ' +
      labels.pluralInSentence('Activity') +
      ' and the rest); its schedules, versions, special days and events, elective seats and campers\' choices stay in "' +
      season.Name +
      '". To copy, send these dates back as seen with copy_season.';
  }
}
