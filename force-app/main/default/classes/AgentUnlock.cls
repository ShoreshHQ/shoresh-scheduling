/**
 * unlock: Generated Schedule's Unlock on a cell, a day, a group or a group's day, as the person,
 * through an agent or the command line (docs/protocol/api.md API-1.37). Web address
 * /v1/unlock_cells, POST {season, week, program, day, group, time}; the same as AgentLock, the
 * other way.
 */
@RestResource(urlMapping='/v1/unlock_cells')
global with sharing class AgentUnlock {
  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentLock(GeneratedWeek.UNLOCK));
  }
}
