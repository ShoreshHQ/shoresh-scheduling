/**
 * download_elective_files (docs/protocol/api.md API-1.88): what the Elective seats screen reads
 * before a final run's Download menu. Web address /v1/elective_file, GET
 * ?season=&week=&elective_set=. The screen's own read of the set and week's finalized run
 * (ElectiveSeatsController.runDownload), the newest one finalized, with the season's setup
 * (activity names and the camp's words). Refused when nothing is finalized yet, as the screen
 * offers Download only on a final run.
 */
@RestResource(urlMapping='/v1/elective_file')
global with sharing class AgentElectiveFile implements AgentFiles.Read {
  @HttpGet
  global static void get() {
    AgentFiles.answer(new AgentElectiveFile());
  }

  public Set<String> fields() {
    return new Set<String>{ 'season', 'week', 'elective_set' };
  }

  public String run(Map<String, Object> asked) {
    AgentElectives.Run run = AgentElectives.finalized(asked);
    Season__c season = AgentFiles.seasonOf(asked);
    return AgentFiles.joined(
      new Map<String, String>{
        'download' => JSON.serialize(
          ElectiveSeatsController.runDownload(run.id)
        ),
        'setup' => AgentFiles.setupOf(season)
      }
    );
  }
}
