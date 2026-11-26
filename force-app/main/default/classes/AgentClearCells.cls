/**
 * clear_day and clear_week: a day or week of a program's Manual Build cleared, as the person,
 * through an agent or the command line (docs/protocol/api/week-edits.md API-1.143). Web address
 * /v1/clear_cells; the edit is AgentCells', with the week kept first as Clear keeps it on the
 * screen ("Before Clear Monday", WEEK-6.14).
 */
@RestResource(urlMapping='/v1/clear_cells')
global with sharing class AgentClearCells {
  @HttpPost
  global static void post() {
    AgentRequest.answer(new AgentCells(true));
  }
}
