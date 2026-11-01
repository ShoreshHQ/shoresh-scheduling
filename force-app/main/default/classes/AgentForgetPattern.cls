/** forget_learned_pattern: Forget pattern on "What Shoresh has learned", API-1.96 (docs/protocol/api.md). Shared parts: AgentLearned. */
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
    return forgetPattern(AgentFields.body(FIELDS));
  }

  /**
   * forget_learned_pattern: the screen's Forget pattern (its answers stay), while the pattern's
   * mark is as seen: the Id of the mark an earlier Forget left, or "none".
   */
  private static String forgetPattern(Map<String, Object> body) {
    Id campId = AgentLearned.campOf(body);
    String ref = AgentLearned.raw(body, 'pattern');
    // "pattern:<template>:<antecedent>", as read_learned_answers names it.
    List<String> parts = ref.split(':', 3);
    if (parts.size() != 3 || parts[0] != 'pattern') {
      throw new ShoreshException(
        'Say the pattern as read_learned_answers names it (pattern), like "pattern:numbered:Lunch".' +
        AgentLearned.NOTHING
      );
    }
    String seen = AgentLearned.seenOf(body);
    String key = ImportAnswers.keyOf(
      campId,
      LearnedAnswers.markerOf(parts[1], parts[2])
    );
    List<ImportAnswer__c> marks = [
      SELECT Id
      FROM ImportAnswer__c
      WHERE Key__c = :key AND Camp__c = :campId
      WITH USER_MODE
      LIMIT 1
      FOR UPDATE
    ];
    String now = marks.isEmpty() ? 'none' : String.valueOf(marks[0].Id);
    if (!now.equals(seen)) {
      throw new AgentWeeks.ConflictException(
        'Someone forgot that pattern or undid it since you read it, so nothing was changed.' +
        AgentLearned.READ_AGAIN
      );
    }
    List<Id> ids;
    try {
      ids = LearnedController.forgetLearnedPattern(campId, parts[1], parts[2]);
    } catch (Exception e) {
      throw AgentLearned.refused(e);
    }
    return 'Forgot the pattern: the answers saved until now no longer count toward it, and they stay remembered. To undo it, use undo_learned_answer with undo "pattern:' +
      String.join(ids, ':') +
      '".';
  }
}
