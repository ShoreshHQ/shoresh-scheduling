/**
 * The history behind "What Shoresh has learned" (repo ADR 0023): one LearnedEvent__c for each
 * thing that happens to what a camp remembers, written in the same transaction as the change it
 * records, never edited. Who and when are the record's own Created By and date. The screen
 * (c/shoreshLearned history.js) lists them newest first and works out the patterns' steps from
 * them; nothing here is shown as it is stored.
 *
 * What: answered (an import or a setup screen saved a new answer), changed (on the screen),
 * forgotten (an answer, or a pattern's marker saved), undone (an answer or marker back, or a
 * pattern's marker gone), auto (an import filled the question in on its own: nothing saved).
 */
public with sharing class LearnedEvents {
  public static final String ANSWERED = 'answered';
  public static final String CHANGED = 'changed';
  public static final String FORGOTTEN = 'forgotten';
  public static final String UNDONE = 'undone';
  public static final String AUTO = 'auto';

  /** One event, as the screen reads it (sent only, never read back). */
  public class Event {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String what;
    @AuraEnabled
    public String question;
    @AuraEnabled
    public String answer;
    @AuraEnabled
    public String shape;
    @AuraEnabled
    public Boolean fromSuggestion;
    /** The remembered answer it made or acted on, or none. */
    @AuraEnabled
    public Id answerId;
    @AuraEnabled
    public Boolean byYou;
    /** Who: their first name (else their name); none for a former user. */
    @AuraEnabled
    public String byName;
    /** When, as a date in the camp's time zone (else the reader's). */
    @AuraEnabled
    public Date answeredOn;
    @AuraEnabled
    public Datetime savedAt;
  }

  /** An event about an answer record (its camp, question, answer, shape and suggestion). */
  public static LearnedEvent__c of(String what, ImportAnswer__c row) {
    return new LearnedEvent__c(
      Camp__c = row.Camp__c,
      What__c = what,
      QuestionKey__c = row.QuestionKey__c,
      Answer__c = row.Answer__c == null ? null : row.Answer__c.left(255),
      Shape__c = row.Shape__c,
      FromSuggestion__c = row.FromSuggestion__c == true,
      AnswerId__c = row.Id
    );
  }

  /** An event about a question with no record of its own: a pattern's marker gone. */
  public static LearnedEvent__c gone(ImportAnswer__c row) {
    LearnedEvent__c event = of(UNDONE, row);
    event.AnswerId__c = null;
    return event;
  }

  /** What an import filled in on its own (MEMO-5.1, plan list "autoApplied"): never saved as an answer. */
  public static List<LearnedEvent__c> autoApplied(Id campId, ImportPlan plan) {
    List<LearnedEvent__c> result = new List<LearnedEvent__c>();
    for (ImportPlan.Entry entry : plan.entries('autoApplied')) {
      if (String.isNotBlank(entry.key()) && entry.text('answer') != null) {
        result.add(
          of(
            AUTO,
            new ImportAnswer__c(
              Camp__c = campId,
              QuestionKey__c = entry.key(),
              Answer__c = entry.text('answer')
            )
          )
        );
      }
    }
    return result;
  }

  /** One event of this kind for each answer. */
  public static List<LearnedEvent__c> each(
    String what,
    List<ImportAnswer__c> rows
  ) {
    List<LearnedEvent__c> result = new List<LearnedEvent__c>();
    for (ImportAnswer__c row : rows) {
      result.add(of(what, row));
    }
    return result;
  }

  /** Saves events in user mode: one write, none when there are none. */
  public static void save(List<LearnedEvent__c> events) {
    if (!events.isEmpty()) {
      UserModeWrites.save(events);
    }
  }

  /** The camp's events, newest first. One query, whatever the number. */
  public static List<Event> forCamp(Id campId) {
    List<Event> result = new List<Event>();
    for (LearnedEvent__c row : [
      SELECT
        Id,
        What__c,
        QuestionKey__c,
        Answer__c,
        Shape__c,
        FromSuggestion__c,
        AnswerId__c,
        CreatedDate,
        CreatedById,
        CreatedBy.FirstName,
        CreatedBy.Name,
        CreatedBy.IsActive,
        Camp__r.TimeZone__c
      FROM LearnedEvent__c
      WHERE Camp__c = :campId
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 5000
    ]) {
      result.add(eventOf(row));
    }
    return result;
  }

  private static Event eventOf(LearnedEvent__c row) {
    Event event = new Event();
    event.id = row.Id;
    event.what = row.What__c;
    event.question = row.QuestionKey__c;
    event.answer = row.Answer__c;
    event.shape = row.Shape__c;
    event.fromSuggestion = row.FromSuggestion__c == true;
    event.answerId = String.isBlank(row.AnswerId__c)
      ? null
      : Id.valueOf(row.AnswerId__c);
    event.byYou = row.CreatedById == UserInfo.getUserId();
    if (row.CreatedBy.IsActive == true) {
      event.byName = String.isBlank(row.CreatedBy.FirstName)
        ? row.CreatedBy.Name
        : row.CreatedBy.FirstName;
    }
    String zone = row.Camp__r.TimeZone__c;
    event.answeredOn = String.isBlank(zone)
      ? row.CreatedDate.date()
      : Date.valueOf(row.CreatedDate.format('yyyy-MM-dd', zone));
    event.savedAt = row.CreatedDate;
    return event;
  }
}
