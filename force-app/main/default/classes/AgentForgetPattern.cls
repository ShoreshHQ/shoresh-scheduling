/** forget_learned_pattern: Forget pattern on "What Shoresh has learned" (API-1.96): AgentLearned.forgetPattern. */
@RestResource(urlMapping='/v1/forget_learned_pattern')
global with sharing class AgentForgetPattern implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'pattern',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentForgetPattern());
  }

  public String run() {
    return AgentLearned.forgetPattern(AgentFields.body(FIELDS));
  }
}
