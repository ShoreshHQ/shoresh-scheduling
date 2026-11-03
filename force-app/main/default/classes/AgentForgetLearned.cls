/** forget_learned_answer: Forget on "What Shoresh has learned", API-1.95 (docs/protocol/api.md). Shared parts: AgentLearned. */
@RestResource(urlMapping='/v1/forget_learned_answer')
global with sharing class AgentForgetLearned implements AgentWeeks.Action, AgentAskFirst.Preview {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'answer_id',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentForgetLearned());
  }

  /** Which answer it forgets (API-1.106). */
  public String preview() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    ImportAnswer__c row = AgentLearned.locked(AgentLearned.campOf(body), body);
    return 'This forgets the remembered answer "' +
      row.Answer__c +
      '": the next import asks that question again.';
  }

  public String run() {
    return forget(AgentFields.body(FIELDS));
  }

  /** forget_learned_answer: the screen's Forget on an answer, while it is still as seen. */
  private static String forget(Map<String, Object> body) {
    Id campId = AgentLearned.campOf(body);
    ImportAnswer__c row = AgentLearned.locked(campId, body);
    if (row.QuestionKey__c.startsWith(AgentLearned.PATTERN)) {
      throw new ShoreshException(
        'That is a forgotten pattern\'s mark, not an answer: the screen has no Forget for it.' +
        AgentLearned.NOTHING
      );
    }
    Boolean done;
    try {
      done = LearnedController.forgetLearned(campId, row.Id);
    } catch (Exception e) {
      throw AgentLearned.refused(e);
    }
    if (done != true) {
      throw AgentLearned.stale();
    }
    return 'Forgot "' +
      row.Answer__c +
      '": the next import asks that question again. To undo it, use undo_learned_answer with undo "forget:' +
      row.Id +
      '".';
  }
}
