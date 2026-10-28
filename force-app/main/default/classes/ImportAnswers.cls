/**
 * Answers a camp gave to import questions (Greg: remember exact answers, so a similar file does
 * not ask again). Keyed by the question, which is built from names, never record Ids, so an
 * answer still works after a season is copied. "Leave it out for now" forgets an answer: the next
 * import asks again.
 */
public with sharing class ImportAnswers {
  // Tests only: the save refused after the old answers were deleted.
  @TestVisible
  private static Boolean refuseSave = false;

  /** One remembered answer, with who gave it and when (the record's Created By and date; sent only, never read back). */
  public class Answer {
    @AuraEnabled
    public String key { get; set; }
    @AuraEnabled
    public String answer { get; set; }
    /** The person reading is who answered it. */
    @AuraEnabled
    public Boolean byYou;
    /** Who answered it: their first name (else their name); none for a former user. */
    @AuraEnabled
    public String byName;
    /** When, as a date in the camp's time zone. */
    @AuraEnabled
    public Date answeredOn;
    /** When it was saved: one import's answers are saved together (the patterns' imports). */
    @AuraEnabled
    public Datetime savedAt;
    /** The question's shape when it was answered (c/shoreshPatterns), or none. */
    @AuraEnabled
    public String shape;
    /** It agreed with the suggestion its question showed (repo ADR 0021 choice 11). */
    @AuraEnabled
    public Boolean fromSuggestion;
    /** Changed on "What Shoresh has learned", not answered in an import. */
    @AuraEnabled
    public Boolean fromLearned;
  }

  /**
   * The camp's remembered answers, newest first (as LearnedAnswers reads them), so past 5000 the
   * oldest are the ones left out, never a recent answer or a forgotten pattern's marker. One
   * query, whatever the number.
   */
  public static List<Answer> forCamp(Id campId) {
    List<Answer> result = new List<Answer>();
    for (ImportAnswer__c row : [
      SELECT
        QuestionKey__c,
        Answer__c,
        Shape__c,
        FromSuggestion__c,
        FromLearned__c,
        CreatedDate,
        CreatedById,
        CreatedBy.FirstName,
        CreatedBy.Name,
        CreatedBy.IsActive,
        Camp__r.TimeZone__c
      FROM ImportAnswer__c
      WHERE Camp__c = :campId
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 5000
    ]) {
      result.add(answerOf(row));
    }
    return result;
  }

  private static Answer answerOf(ImportAnswer__c row) {
    Answer answer = new Answer();
    answer.key = row.QuestionKey__c;
    answer.answer = row.Answer__c;
    answer.byYou = row.CreatedById == UserInfo.getUserId();
    answer.byName = byNameOf(row);
    answer.answeredOn = answeredOnOf(row);
    answer.savedAt = row.CreatedDate;
    answer.shape = row.Shape__c;
    answer.fromSuggestion = row.FromSuggestion__c == true;
    answer.fromLearned = row.FromLearned__c == true;
    return answer;
  }

  /**
   * Who answered (the row read with CreatedBy.FirstName, Name, IsActive): their first name, else
   * their name; none when their user is inactive (the screens say "a former user").
   */
  public static String byNameOf(ImportAnswer__c row) {
    if (row.CreatedBy.IsActive != true) {
      return null;
    }
    return String.isBlank(row.CreatedBy.FirstName)
      ? row.CreatedBy.Name
      : row.CreatedBy.FirstName;
  }

  /** When (the row read with CreatedDate, Camp__r.TimeZone__c): in the camp's time zone, else the reader's. */
  public static Date answeredOnOf(ImportAnswer__c row) {
    String zone = row.Camp__r.TimeZone__c;
    return String.isBlank(zone)
      ? row.CreatedDate.date()
      : Date.valueOf(row.CreatedDate.format('yyyy-MM-dd', zone));
  }

  /** Remembers the answers given and forgets the ones left out. */
  public static void save(Id campId, ImportPlan plan) {
    List<ImportAnswer__c> wanted = new List<ImportAnswer__c>();
    for (ImportPlan.Entry entry : plan.entries('remember')) {
      ImportAnswer__c row = rowOf(campId, entry.key(), entry.text('answer'));
      // What the pattern layer reads (repo ADR 0021 choice 11): the question's shape, and
      // whether the answer agreed with a suggestion. Words only, cut to the field.
      String shape = entry.text('shape');
      row.Shape__c = String.isBlank(shape) ? null : shape.left(64);
      row.FromSuggestion__c = entry.text('suggested') == 'true';
      wanted.add(row);
    }
    Set<String> forget = new Set<String>();
    for (String question : plan.texts('forget')) {
      forget.add(keyOf(campId, question));
    }
    // What the import filled in on its own (MEMO-5.1): never saved as an answer, only as history.
    write(wanted, forget, LearnedEvents.autoApplied(campId, plan));
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
   * guessed, with the value it saved (SetupGuesses), and the names a choices import was told
   * about. Two queries at most: the rows there are, then the write.
   */
  public static void rememberEach(Id campId, Map<String, String> answerOf) {
    if (answerOf.isEmpty()) {
      return;
    }
    List<ImportAnswer__c> wanted = new List<ImportAnswer__c>();
    for (String question : answerOf.keySet()) {
      wanted.add(rowOf(campId, question, answerOf.get(question)));
    }
    write(wanted, new Set<String>(), new List<LearnedEvent__c>());
  }

  private static ImportAnswer__c rowOf(
    Id campId,
    String question,
    String answer
  ) {
    return new ImportAnswer__c(
      Camp__c = campId,
      Key__c = keyOf(campId, question),
      QuestionKey__c = question,
      Answer__c = answer.left(255)
    );
  }

  /**
   * Saves the wanted answers and forgets the rest, so who answered and when (the record's Created
   * By and date, ADR 0021) stays true: an answer already remembered the same is left as it is;
   * one remembered differently is replaced (deleted first, as the key is unique, then saved new),
   * never edited. A guess given again the same is the exception: it is saved again unchanged, so
   * its Last Modified says when it was last guessed, which marks a record made since then
   * (SetupGuessStanding), and its Created By and date stay. One query, then the writes.
   */
  private static void write(
    List<ImportAnswer__c> wanted,
    Set<String> forget,
    List<LearnedEvent__c> events
  ) {
    Map<String, ImportAnswer__c> byKey = new Map<String, ImportAnswer__c>();
    for (ImportAnswer__c row : wanted) {
      byKey.put(row.Key__c, row);
    }
    Set<String> all = new Set<String>(byKey.keySet());
    all.addAll(forget);
    List<ImportAnswer__c> deletes = new List<ImportAnswer__c>();
    List<ImportAnswer__c> touches = new List<ImportAnswer__c>();
    for (ImportAnswer__c saved : [
      SELECT
        Id,
        Camp__c,
        Key__c,
        QuestionKey__c,
        Answer__c,
        Shape__c,
        FromSuggestion__c
      FROM ImportAnswer__c
      WHERE Key__c IN :all
      WITH USER_MODE
    ]) {
      ImportAnswer__c given = byKey.get(saved.Key__c);
      if (given != null && given.Answer__c.equals(saved.Answer__c)) {
        byKey.remove(saved.Key__c);
        if (given.QuestionKey__c.startsWith(SetupGuessValues.PREFIX)) {
          touches.add(
            new ImportAnswer__c(Id = saved.Id, Answer__c = saved.Answer__c)
          );
        }
      } else if (given != null || forget.contains(saved.Key__c)) {
        deletes.add(saved);
        if (given == null) {
          events.add(LearnedEvents.of(LearnedEvents.FORGOTTEN, saved));
        }
      }
    }
    touches.addAll(byKey.values());
    commitAll(deletes, touches, events);
  }

  /**
   * Deletes, then saves (new and unchanged), all or none: a refused save puts the old answers
   * back. Each new answer, and each given event, is kept as history (LearnedEvents).
   */
  private static void commitAll(
    List<ImportAnswer__c> deletes,
    List<ImportAnswer__c> saves,
    List<LearnedEvent__c> events
  ) {
    List<ImportAnswer__c> fresh = new List<ImportAnswer__c>();
    for (ImportAnswer__c row : saves) {
      if (row.Id == null) {
        fresh.add(row);
      }
    }
    Savepoint before = Database.setSavepoint();
    try {
      Database.delete(deletes, true, AccessLevel.USER_MODE);
      if (refuseSave) {
        throw new ShoreshException('Refused.');
      }
      UserModeWrites.save(saves);
      events.addAll(LearnedEvents.each(LearnedEvents.ANSWERED, fresh));
      LearnedEvents.save(events);
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
  }

  /** Forgets answers for the camp (a guess the director says looks right). Two queries at most. */
  public static void forget(Id campId, Set<String> questions) {
    Set<String> keys = new Set<String>();
    for (String question : questions) {
      keys.add(keyOf(campId, question));
    }
    List<ImportAnswer__c> rows = [
      SELECT Id, Camp__c, QuestionKey__c, Answer__c, Shape__c, FromSuggestion__c
      FROM ImportAnswer__c
      WHERE Key__c IN :keys
      WITH USER_MODE
    ];
    List<LearnedEvent__c> events = LearnedEvents.each(
      LearnedEvents.FORGOTTEN,
      rows
    );
    Savepoint before = Database.setSavepoint();
    try {
      Database.delete(rows, true, AccessLevel.USER_MODE);
      LearnedEvents.save(events);
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
  }

  /** Camp and question: the camp's Id and a digest of the full question key. */
  public static String keyOf(Id campId, String question) {
    return campId +
      ':' +
      EncodingUtil.convertToHex(
        Crypto.generateDigest('SHA-256', Blob.valueOf(question))
      );
  }
}
