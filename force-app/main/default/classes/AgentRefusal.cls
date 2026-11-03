/**
 * A refusal said to the person on a screen, or to an AI (docs/protocol/api.md API-1.105). A screen
 * may tell the director what to do next ("First choose another location for that activity"); an AI
 * is told only what is wrong, since a smaller AI reads advice as an instruction and repairs things
 * itself, unasked. The one runner (AgentWeeks.answer) marks an action as an agent's.
 */
public with sharing class AgentRefusal {
  public static Boolean forAgent = false;

  /** The screen's sentence, or the agent's. */
  public static String say(String screen, String agent) {
    return forAgent ? agent : screen;
  }

  /** The problem, then the screen's advice; an agent hears the problem alone. */
  public static String withFix(String problem, String fix) {
    return forAgent ? problem : problem + ' ' + fix;
  }
}
