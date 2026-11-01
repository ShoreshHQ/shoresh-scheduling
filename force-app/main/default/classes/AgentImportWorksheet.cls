/**
 * import_worksheet: Roots' Import worksheet (the whole-camp workbook), through an agent or the
 * command line (docs/protocol/api.md API-1.81). Web address /v1/import_worksheet. GET ?season= is
 * what Roots reads before a file; POST {season, seen, plan} is the screen's own save
 * (ImportController.saveWorkbook) of the plan the connector worked out with the screen's own
 * module, made only while the setup is as read (AgentImports).
 */
@RestResource(urlMapping='/v1/import_worksheet')
global with sharing class AgentImportWorksheet implements AgentWeeks.Action {
  @HttpGet
  global static void get() {
    AgentImports.answerRead();
  }

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentImportWorksheet());
  }

  public String run() {
    return AgentImports.saveWorkbook();
  }
}
