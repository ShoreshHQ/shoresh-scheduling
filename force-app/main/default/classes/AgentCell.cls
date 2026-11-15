/**
 * change_schedule_cell: one cell of a program's Generated Schedule or Manual Build week typed in,
 * as the person, through an agent or the command line (docs/protocol/api.md API-1.11, API-1.13,
 * API-1.41, API-1.124). Web address /v1/schedule_cell; the edit is AgentCells'. As typing in a
 * cell on the screen does, the connector works it out with the week editor's own steps
 * (c/shoreshWeekEditor handEdits.js placeStep, specials placeOverStep): an activity placed for its
 * full length, a cell of a longer placement replacing that placement, an elective set over the
 * placement's time blocks, Open clearing the placement.
 */
@RestResource(urlMapping='/v1/schedule_cell')
global with sharing class AgentCell {
  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentCells());
  }
}
