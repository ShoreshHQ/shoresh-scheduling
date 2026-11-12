/**
 * archive_season: archive a season, as Camp Setup's Archive does where Delete season is refused
 * for published history (docs/protocol/api.md API-1.145; WEEK-1.9, WEEK-1.10). Web address
 * /v1/archive_season, POST {season}. The season MUST be named, never the one the screens open on.
 * Everything in it is kept, read-only, and it leaves the season picker; bring_back_season undoes
 * it, so it doesn't ask first. Refused for a season never published, as the screen offers Archive
 * only in Delete's place for one that was (ADR 0029 choice 8). The screen's own save (SeasonArchive).
 */
@RestResource(urlMapping='/v1/archive_season')
global with sharing class AgentArchiveSeason implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{ 'season' };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentArchiveSeason());
  }

  public String run() {
    Season__c season = named('archive');
    if (ArchivedSeasons.isArchived(season.Id)) {
      throw new ShoreshException(
        '"' + season.Name + '" is already archived. Nothing was changed.'
      );
    }
    // The screen offers Archive only in Delete's place, for a season ever published: an AI may do
    // what the screen offers, no more (ADR 0029 choice 8).
    if (!PublishedHistory.wasPublished(season.Id)) {
      throw new ShoreshException(
        '"' +
          season.Name +
          '" was never published, so it can\'t be archived. It can be deleted instead (delete_season).'
      );
    }
    try {
      SeasonArchive.archive(season.Id);
    } catch (Exception e) {
      throw new ShoreshException(
        '"' +
          season.Name +
          '" not archived. Nothing was changed. ' +
          ScreenErrors.words(e)
      );
    }
    return 'Archived "' +
      season.Name +
      '". Everything in it is kept, read-only, and it is out of the season picker.';
  }

  /** The season the request names; one left out is never assumed. */
  public static Season__c named(String verb) {
    String name = AgentFields.text(AgentFields.body(FIELDS), 'season');
    if (String.isBlank(name)) {
      throw new ShoreshException('Say which season to ' + verb + ' (season).');
    }
    return OutgoingRows.seasonCalled(name);
  }
}
