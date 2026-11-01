/**
 * import_last_year: Import last year, through an agent or the command line (docs/protocol/api.md
 * API-1.84). Web address /v1/import_last_year. GET ?season= is what the screen reads before the
 * files (the setup, the camp's remembered answers, what earlier imports brought in); POST
 * {season, seen, plan} is the screen's own save (ImportController.saveSetup) of the plan the
 * connector worked out with the screen's own modules, made only while the setup, the weeks'
 * schedules and the special days are as read (AgentImports).
 */
@RestResource(urlMapping='/v1/import_last_year')
global with sharing class AgentImportLastYear implements AgentWeeks.Action {
  @HttpGet
  global static void get() {
    AgentImports.answerRead(AgentImports.LAST_YEAR);
  }

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentImportLastYear());
  }

  public String run() {
    return AgentImports.saveLastYear();
  }
}
