/** change_learned_answer: Change on "What Shoresh has learned" (API-1.94): AgentLearned.change. */
@RestResource(urlMapping='/v1/change_learned_answer')
global with sharing class AgentChangeLearned implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'answer_id',
    'answer',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentChangeLearned());
  }

  public String run() {
    return AgentLearned.change(AgentFields.body(FIELDS));
  }
}
