/** undo_learned_answer: Undo on "What Shoresh has learned" (API-1.97): AgentLearned.undo. */
@RestResource(urlMapping='/v1/undo_learned_answer')
global with sharing class AgentUndoLearned implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{ 'season', 'undo' };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentUndoLearned());
  }

  public String run() {
    return AgentLearned.undo(AgentFields.body(FIELDS));
  }
}
