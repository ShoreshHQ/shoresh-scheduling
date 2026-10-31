/**
 * take_out_cell: a placement taken out whole, on a program's Generated Schedule week, as the person, through an agent or the
 * command line (docs/protocol/api.md API-1.38). Web address /v1/take_out_cell; the edit is AgentCells'.
 */
@RestResource(urlMapping='/v1/take_out_cell')
global with sharing class AgentTakeOutCell {
  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentCells());
  }
}
