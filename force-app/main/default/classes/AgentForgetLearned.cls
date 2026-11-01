/** forget_learned_answer: Forget on "What Shoresh has learned" (API-1.95): AgentLearned.forget. */
@RestResource(urlMapping='/v1/forget_learned_answer')
global with sharing class AgentForgetLearned implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'answer_id',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentForgetLearned());
  }

  public String run() {
    return AgentLearned.forget(AgentFields.body(FIELDS));
  }
}
