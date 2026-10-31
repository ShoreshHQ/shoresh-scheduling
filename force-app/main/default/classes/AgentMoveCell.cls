/**
 * move_cell: a placement moved, or swapped with what is there, on a program's Generated Schedule week, as the person, through an agent or the
 * command line (docs/protocol/api.md API-1.38). Web address /v1/move_cell; the edit is AgentCells'.
 */
@RestResource(urlMapping='/v1/move_cell')
global with sharing class AgentMoveCell {
  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentCells());
  }
}
