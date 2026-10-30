/**
 * The questions a batch keeps for a person (IncomingBatch.ask; API-2.2, 4.1) on its import's
 * record (Import__c.Open__c), shown on Roots. Every batch's record keeps them, none as [], which
 * is how Undo and Roots tell a batch from a file import.
 */
public with sharing class IncomingQuestions {
  // Import__c.Open__c's length.
  private static final Integer OPEN_LIMIT = 131072;

  /** As many questions as Import__c.Open__c holds, as JSON ("[]" for none). */
  public static String fitting(List<Map<String, String>> questions) {
    List<Map<String, String>> kept = questions.clone();
    String text = JSON.serialize(kept);
    while (text.length() > OPEN_LIMIT) {
      kept.remove(kept.size() - 1);
      text = JSON.serialize(kept);
    }
    return text;
  }

  /**
   * Adds the new questions to the last import from the same systems when that is a standing
   * batch; true when it was (also when it already asked them all). Read in system mode: a
   * sending key cannot read imports; nothing read is handed back.
   */
  public static Boolean joinLastBatch(IncomingBatch batch) {
    String source = IncomingSave.sourceOf(batch);
    List<Import__c> last = [
      SELECT Id, Season__c, Open__c, UndoneAt__c
      FROM Import__c
      WHERE Season__c = :batch.season.Id AND Source__c = :source
      WITH SYSTEM_MODE
      ORDER BY CreatedDate DESC, Name DESC
      LIMIT 1
    ];
    if (
      last.isEmpty() ||
      last[0].UndoneAt__c != null ||
      !isBatch(last[0].Open__c)
    ) {
      return false;
    }
    List<Map<String, String>> asked = (List<Map<String, String>>) JSON.deserialize(
      last[0].Open__c,
      List<Map<String, String>>.class
    );
    Set<String> keys = new Set<String>();
    for (Map<String, String> question : asked) {
      keys.add(question.get('key'));
    }
    Integer before = asked.size();
    for (Map<String, String> question : batch.questions) {
      if (keys.add(question.get('key'))) {
        asked.add(question);
      }
    }
    if (asked.size() > before) {
      last[0].Open__c = fitting(asked);
      ImportLog.updateIncomingQuestions(last[0]);
    }
    return true;
  }

  /** Whether an import's questions are a batch's: a list, every key a batch's own. */
  public static Boolean isBatch(String questions) {
    if (String.isBlank(questions) || !questions.startsWith('[')) {
      return false;
    }
    try {
      for (
        Map<String, String> question : (List<Map<String, String>>) JSON.deserialize(
          questions,
          List<Map<String, String>>.class
        )
      ) {
        String key = question.get('key');
        if (key == null || !key.startsWith(IncomingBatch.QUESTION_PREFIX)) {
          return false;
        }
      }
    } catch (JSONException e) {
      return false;
    }
    return true;
  }
}
