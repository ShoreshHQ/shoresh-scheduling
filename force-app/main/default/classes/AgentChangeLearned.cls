/** change_learned_answer: Change on "What Shoresh has learned", API-1.94 (docs/protocol/api.md). Shared parts: AgentLearned. */
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
    return change(AgentFields.body(FIELDS));
  }

  /** change_learned_answer: the screen's Change and Save, while the answer is still as seen. */
  private static String change(Map<String, Object> body) {
    Id campId = AgentLearned.campOf(body);
    ImportAnswer__c row = AgentLearned.locked(campId, body);
    String answer = AgentFields.text(body, 'answer');
    requireChoice(row, answer);
    Id newId;
    try {
      newId = LearnedController.changeLearned(campId, row.Id, answer);
    } catch (Exception e) {
      throw AgentLearned.refused(e);
    }
    if (newId == null) {
      throw AgentLearned.stale();
    }
    return 'Changed "' +
      row.Answer__c +
      '" to "' +
      answer +
      '". Shoresh remembers it as changed by you, today. To undo it, use undo_learned_answer with undo "change:' +
      newId +
      ':' +
      row.Id +
      '".';
  }

  /** Only an answer the screen offers for that question, and not the one it is now. */
  private static void requireChoice(ImportAnswer__c row, String answer) {
    Set<String> choices = LearnedChoices.allowed(row.QuestionKey__c);
    if (choices == null) {
      throw new ShoreshException(
        'That answer can only be forgotten, not changed: the screen offers no Change for it.' +
        AgentLearned.NOTHING
      );
    }
    if (!choices.contains(answer)) {
      List<String> said = new List<String>(choices);
      said.sort();
      throw new ShoreshException(
        (String.isBlank(answer)
            ? 'Say the answer to change it to (answer). '
            : '"' + answer.left(40) + '" can\'t be given to this question. ') +
          'It can be: ' +
          String.join(said, ', ') +
          '.' +
          AgentLearned.NOTHING
      );
    }
    if (answer.equals(row.Answer__c)) {
      throw new ShoreshException(
        'It is already "' + answer + '".' + AgentLearned.NOTHING
      );
    }
  }
}
