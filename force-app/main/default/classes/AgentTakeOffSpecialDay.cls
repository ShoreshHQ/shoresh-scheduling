/**
 * take_special_day_off_day: a special day's "Take off" through an agent or the command line
 * (docs/protocol/api.md API-1.74). Web address /v1/take_special_day_off_day; the action is
 * AgentSpecialDay's, the other way.
 */
@RestResource(urlMapping='/v1/take_special_day_off_day')
global with sharing class AgentTakeOffSpecialDay {
  /** Takes the special day off the day, as AgentSpecialDay does. */
  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentSpecialDay(AgentSpecialDay.TAKE_OFF));
  }
}
