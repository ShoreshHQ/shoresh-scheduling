/**
 * copy_cells: cells copied and pasted, on a program's Generated Schedule week, as the person, through an agent or the
 * command line (docs/protocol/api.md API-1.38). Web address /v1/copy_cells; the edit is AgentCells'.
 */
@RestResource(urlMapping='/v1/copy_cells')
global with sharing class AgentCopyCells {
  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentCells());
  }
}
