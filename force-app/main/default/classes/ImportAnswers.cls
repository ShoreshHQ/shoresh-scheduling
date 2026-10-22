/**
 * Answers a camp gave to import questions (Greg: remember exact answers, so a similar file does
 * not ask again). Keyed by the question, which is built from names, never record Ids, so an
 * answer still works after a season is copied. "Leave it out for now" forgets an answer: the next
 * import asks again.
 */
public with sharing class ImportAnswers {
  /** One remembered answer. */
  public class Answer {
    @AuraEnabled
    public String key { get; set; }
    @AuraEnabled
    public String answer { get; set; }
  }

  public static List<Answer> forCamp(Id campId) {
    List<Answer> result = new List<Answer>();
    for (ImportAnswer__c row : [
      SELECT QuestionKey__c, Answer__c
      FROM ImportAnswer__c
      WHERE Camp__c = :campId
      WITH USER_MODE
      ORDER BY CreatedDate
      LIMIT 5000
    ]) {
      Answer answer = new Answer();
      answer.key = row.QuestionKey__c;
      answer.answer = row.Answer__c;
      result.add(answer);
    }
    return result;
  }

  /** Remembers the answers given and forgets the ones left out. */
  public static void save(Id campId, ImportPlan plan) {
    Map<String, String> remember = new Map<String, String>();
    for (ImportPlan.Entry entry : plan.entries('remember')) {
      remember.put(keyOf(campId, entry.key()), entry.text('answer'));
    }
    Map<String, String> questions = new Map<String, String>();
    for (ImportPlan.Entry entry : plan.entries('remember')) {
      questions.put(keyOf(campId, entry.key()), entry.key());
    }
    Set<String> forget = new Set<String>();
    for (String question : plan.texts('forget')) {
      forget.add(keyOf(campId, question));
    }
    Set<String> all = new Set<String>(remember.keySet());
    all.addAll(forget);
    Map<String, ImportAnswer__c> saved = new Map<String, ImportAnswer__c>();
    for (ImportAnswer__c row : [
      SELECT Id, Key__c
      FROM ImportAnswer__c
      WHERE Key__c IN :all
      WITH USER_MODE
    ]) {
      saved.put(row.Key__c, row);
    }
    List<ImportAnswer__c> writes = new List<ImportAnswer__c>();
    for (String key : remember.keySet()) {
      ImportAnswer__c row = saved.containsKey(key)
        ? new ImportAnswer__c(Id = saved.get(key).Id)
        : new ImportAnswer__c(
            Camp__c = campId,
            Key__c = key,
            QuestionKey__c = questions.get(key)
          );
      row.Answer__c = remember.get(key).left(255);
      writes.add(row);
    }
    List<ImportAnswer__c> deletes = new List<ImportAnswer__c>();
    for (String key : forget) {
      if (saved.containsKey(key)) {
        deletes.add(saved.get(key));
      }
    }
    UserModeWrites.save(writes);
    Database.delete(deletes, true, AccessLevel.USER_MODE);
  }

  /**
   * Remembers answers for the camp, outside an import: a delete on a setup screen remembers
   * "deleted" (SetupDeletions), for the item and, for a program, the groups that went with it.
   * Two queries at most, whatever the number: the rows there are, then the write.
   */
  public static void remember(
    Id campId,
    List<String> questions,
    String answer
  ) {
    Map<String, String> answerOf = new Map<String, String>();
    for (String question : questions) {
      answerOf.put(question, answer);
    }
    rememberEach(campId, answerOf);
  }

  /**
   * Remembers an answer per question for the camp, outside an import's questions: what an import
   * guessed, with the value it saved (SetupGuesses). Two queries at most: the rows there are, then
   * the write.
   */
  public static void rememberEach(Id campId, Map<String, String> answerOf) {
    if (answerOf.isEmpty()) {
      return;
    }
    Map<String, String> questionOf = new Map<String, String>();
    for (String question : answerOf.keySet()) {
      questionOf.put(keyOf(campId, question), question);
    }
    Set<String> keys = questionOf.keySet();
    Map<String, Id> saved = new Map<String, Id>();
    for (ImportAnswer__c row : [
      SELECT Id, Key__c
      FROM ImportAnswer__c
      WHERE Key__c IN :keys
      WITH USER_MODE
    ]) {
      saved.put(row.Key__c, row.Id);
    }
    List<ImportAnswer__c> writes = new List<ImportAnswer__c>();
    for (String key : questionOf.keySet()) {
      ImportAnswer__c row = saved.containsKey(key)
        ? new ImportAnswer__c(Id = saved.get(key))
        : new ImportAnswer__c(
            Camp__c = campId,
            Key__c = key,
            QuestionKey__c = questionOf.get(key)
          );
      row.Answer__c = answerOf.get(questionOf.get(key)).left(255);
      writes.add(row);
    }
    UserModeWrites.save(writes);
  }

  /** Forgets answers for the camp (a guess the director says looks right). Two queries at most. */
  public static void forget(Id campId, Set<String> questions) {
    Set<String> keys = new Set<String>();
    for (String question : questions) {
      keys.add(keyOf(campId, question));
    }
    Database.delete(
      [SELECT Id FROM ImportAnswer__c WHERE Key__c IN :keys WITH USER_MODE],
      true,
      AccessLevel.USER_MODE
    );
  }

  /** Camp and question: the camp's Id and a digest of the full question key. */
  private static String keyOf(Id campId, String question) {
    return campId +
      ':' +
      EncodingUtil.convertToHex(
        Crypto.generateDigest('SHA-256', Blob.valueOf(question))
      );
  }
}
