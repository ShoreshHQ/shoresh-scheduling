/**
 * The questions a batch keeps for a person (IncomingBatch.ask; API-2.2, 4.1) on its import's
 * record (Import__c.Open__c), shown on Roots. Every batch's record keeps them, none as [], which
 * is how Undo and Roots tell a batch from a file import.
 */
public with sharing class IncomingQuestions {
  // Import__c.Open__c's length.
  private static final Integer OPEN_LIMIT = 131072;
  // The last question when some didn't fit (API-6.7). It says no count: questions left out keep
  // no key, so the same ones sent again could not be told from new ones.
  private static final String MORE_KEY = IncomingBatch.QUESTION_PREFIX + 'more';
  // Room for that last question and the closing bracket.
  private static final Integer MORE_ROOM = 200;

  /**
   * As many questions as Import__c.Open__c holds, as JSON ("[]" for none), ending in one that
   * says more couldn't be kept when any were left out, now or by an earlier batch it joins.
   */
  public static String fitting(List<Map<String, String>> questions) {
    List<Map<String, String>> kept = new List<Map<String, String>>();
    Boolean more = false;
    for (Map<String, String> question : questions) {
      if (question.get('key') == MORE_KEY) {
        more = true;
      } else {
        kept.add(question);
      }
    }
    String text = JSON.serialize(withMore(kept, more));
    if (text.length() <= OPEN_LIMIT) {
      return text;
    }
    // Each question measured once (a list's JSON is its items' JSON, comma-joined, in [ ]), with
    // room kept for the last question and the closing bracket.
    Integer size = 1;
    Integer fit = 0;
    while (fit < kept.size()) {
      Integer next = JSON.serialize(kept[fit]).length() + 1;
      if (size + next > OPEN_LIMIT - MORE_ROOM) {
        break;
      }
      size += next;
      fit++;
    }
    while (kept.size() > fit) {
      kept.remove(kept.size() - 1);
    }
    return JSON.serialize(withMore(kept, true));
  }

  private static List<Map<String, String>> withMore(
    List<Map<String, String>> kept,
    Boolean more
  ) {
    if (!more) {
      return kept;
    }
    List<Map<String, String>> all = kept.clone();
    all.add(
      new Map<String, String>{
        'key' => MORE_KEY,
        'title' => 'More questions from this system couldn\'t be kept here.'
      }
    );
    return all;
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
