/**
 * delete_season: delete a season, as Camp Setup's Delete season does, through an agent or the
 * command line (docs/protocol/api.md API-1.141). Web address /v1/delete_season, POST {season}. The
 * season MUST be named, never the one the screens open on. It is the setup screens' own delete
 * (SetupDelete): it asks first with the screen's question and what goes with it, and refuses what
 * the screen refuses, with nothing removed.
 */
@RestResource(urlMapping='/v1/delete_season')
global with sharing class AgentDeleteSeason implements AgentWeeks.Action, AgentAskFirst.Preview {
  private static final Set<String> FIELDS = new Set<String>{ 'season' };
  private AgentSetupRecords.Found found;

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentDeleteSeason());
  }

  /** The screen's own question: the season, and each kind it takes with it. */
  public String preview() {
    found = named();
    // The very season shown: one made since under the same name is another delete.
    AgentAskFirst.stateIs(found.id);
    SetupDelete.Preview asked = SetupDelete.preview(found.id);
    if (asked.refusal != null) {
      // WEEK-1.9: as the screen offers Archive in the refusal's place, the AI hears it can be
      // archived (a choice for the person, not a way around the refusal: API-1.105).
      throw notDeleted(
        asked.refusal +
        (asked.archivable
          ? ' It can be archived instead (archive_season).'
          : '')
      );
    }
    return asked.message;
  }

  public String run() {
    try {
      SetupDelete.remove(found.id);
    } catch (Exception e) {
      throw notDeleted(ScreenErrors.words(e));
    }
    return 'Deleted "' + found.name + '".';
  }

  private ShoreshException notDeleted(String why) {
    return new ShoreshException(
      '"' + found.name + '" not deleted. Nothing was removed. ' + why
    );
  }

  private static AgentSetupRecords.Found named() {
    String name = AgentFields.text(AgentFields.body(FIELDS), 'season');
    if (String.isBlank(name)) {
      throw new ShoreshException('Say which season to delete (season).');
    }
    Season__c season = OutgoingRows.seasonCalled(name);
    AgentSetupRecords.Found result = new AgentSetupRecords.Found();
    result.id = season.Id;
    result.name = season.Name;
    return result;
  }
}
