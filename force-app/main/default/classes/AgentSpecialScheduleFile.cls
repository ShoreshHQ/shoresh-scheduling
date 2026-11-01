/**
 * download_special_schedule (docs/protocol/api.md API-1.87): what a special day's or event's own
 * page reads before its Download. Web address /v1/special_schedule_file, GET
 * ?season=&special=&kind=. The page's own read (SpecialScheduleController.openPlan) of the item
 * named, with the season's setup (elective offerings and the camp's words).
 */
@RestResource(urlMapping='/v1/special_schedule_file')
global with sharing class AgentSpecialScheduleFile implements AgentFiles.Read {
  @HttpGet
  global static void get() {
    AgentFiles.answer(new AgentSpecialScheduleFile());
  }

  public Set<String> fields() {
    return new Set<String>{ 'season', 'special', 'kind' };
  }

  public String run(Map<String, Object> asked) {
    AgentSpecials.Found found = AgentSpecials.find(asked);
    Season__c season = AgentFiles.seasonOf(asked);
    return AgentFiles.joined(
      new Map<String, String>{
        'view' => JSON.serialize(
          SpecialScheduleController.openPlan(found.owner.itemId)
        ),
        'setup' => AgentFiles.setupOf(season)
      }
    );
  }
}
