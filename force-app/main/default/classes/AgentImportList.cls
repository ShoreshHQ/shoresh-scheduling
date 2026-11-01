/**
 * import_list: Import a list on a setup screen, through an agent or the command line
 * (docs/protocol/api.md API-1.80). Web address /v1/import_list. GET ?season= is what the screen
 * reads before a file; POST {season, seen, plan} is the screen's own save
 * (ImportController.saveList) of the plan the connector worked out with the screen's own module,
 * made only while the setup is as read (AgentImports).
 */
@RestResource(urlMapping='/v1/import_list')
global with sharing class AgentImportList implements AgentWeeks.Action {
  @HttpGet
  global static void get() {
    AgentImports.answerRead();
  }

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentImportList());
  }

  public String run() {
    return AgentImports.saveList();
  }
}
