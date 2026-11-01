/**
 * place_special_event: a special event put over cells of a program's Generated Schedule or Manual
 * Build week, as the person, through an agent or the command line (docs/protocol/api.md
 * API-1.75), as choosing it from the screen's Special events list does. Web address
 * /v1/place_special_event; the runs are the week editor's own (c/shoreshWeekEditor specials.js
 * eventRuns, run in the connector) and the edit is AgentCells': the screen's own save, each run
 * made only when its cells still hold what was read, kept first as a version so Undo takes it back.
 */
@RestResource(urlMapping='/v1/place_special_event')
global with sharing class AgentPlaceSpecialEvent {
  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentCells());
  }
}
