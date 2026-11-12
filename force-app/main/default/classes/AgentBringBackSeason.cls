/**
 * bring_back_season: bring an archived season back, as Camp Setup's Bring back does
 * (docs/protocol/api.md API-1.145; WEEK-1.12). Web address /v1/bring_back_season, POST {season}.
 * The season MUST be named. It can then be changed again and is in the season picker again. The
 * screen's own save (SeasonArchive).
 */
@RestResource(urlMapping='/v1/bring_back_season')
global with sharing class AgentBringBackSeason implements AgentWeeks.Action {
  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentBringBackSeason());
  }

  public String run() {
    Season__c season = AgentArchiveSeason.named('bring back');
    if (!ArchivedSeasons.isArchived(season.Id)) {
      throw new ShoreshException(
        '"' + season.Name + '" isn\'t archived. Nothing was changed.'
      );
    }
    try {
      SeasonArchive.bringBack(season.Id);
    } catch (Exception e) {
      throw new ShoreshException(
        '"' +
          season.Name +
          '" not brought back. Nothing was changed. ' +
          ScreenErrors.words(e)
      );
    }
    return 'Brought back "' + season.Name + '". It can be changed again.';
  }
}
