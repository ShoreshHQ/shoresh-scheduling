/**
 * download_setup (docs/protocol/api.md API-1.89): what Camp Setup's Download this list and
 * Roots' Download worksheet read. Web address /v1/setup_file, GET ?season=. The season's setup
 * as the screens read it (SeasonSetupController.getSeasonSetupInCamp), with the camp's words.
 */
@RestResource(urlMapping='/v1/setup_file')
global with sharing class AgentSetupFile implements AgentFiles.Read {
  @HttpGet
  global static void get() {
    AgentFiles.answer(new AgentSetupFile());
  }

  public Set<String> fields() {
    return new Set<String>{ 'season' };
  }

  public String run(Map<String, Object> asked) {
    return AgentFiles.joined(
      new Map<String, String>{
        'setup' => AgentFiles.setupOf(AgentFiles.seasonOf(asked))
      }
    );
  }
}
