/**
 * "What Shoresh has learned" (repo ADR 0021; desktop LearnedScreen.jsx): the answers a camp's
 * imports and setup screens remember (ImportAnswer__c, ADR 0006 §19-21), each with who last
 * answered it and when, from the record's own history (no field of its own). Everything runs in
 * user mode and stays inside the camp the screen shows.
 */
public with sharing class LearnedAnswers {
  private static final String CANNOT = 'That answer can\'t be given to this question.';

  /** One remembered answer, as the screen shows it (sent only, never read back). */
  public class Learned {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String question;
    @AuraEnabled
    public String answer;
    /** The person reading is who last answered it. */
    @AuraEnabled
    public Boolean byYou;
    /** Who last answered it: their first name (else their name). */
    @AuraEnabled
    public String byName;
    /** When, as a date in the reader's own time zone. */
    @AuraEnabled
    public Date answeredOn;
  }

  /** The camp's remembered answers, newest first. One query, whatever the number. */
  public static List<Learned> forCamp(Id campId) {
    List<Learned> result = new List<Learned>();
    for (ImportAnswer__c row : [
      SELECT
        Id,
        QuestionKey__c,
        Answer__c,
        LastModifiedDate,
        LastModifiedById,
        LastModifiedBy.FirstName,
        LastModifiedBy.Name
      FROM ImportAnswer__c
      WHERE Camp__c = :campId
      WITH USER_MODE
      ORDER BY LastModifiedDate DESC, Id DESC
      LIMIT 5000
    ]) {
      result.add(learnedOf(row));
    }
    return result;
  }

  /**
   * Changes one answer to another of its choices. False when it is no longer there (forgotten
   * or changed elsewhere): the screen then shows the latest.
   */
  public static Boolean change(Id campId, Id answerId, String answer) {
    ImportAnswer__c row = rowOf(campId, answerId);
    if (row == null) {
      return false;
    }
    if (!LearnedChoices.allows(row.QuestionKey__c, answer)) {
      throw new ShoreshException(CANNOT);
    }
    UserModeWrites.save(
      new List<ImportAnswer__c>{
        new ImportAnswer__c(Id = row.Id, Answer__c = answer)
      }
    );
    return true;
  }

  /** Forgets one answer: the next import asks again. False when it was already gone. */
  public static Boolean forget(Id campId, Id answerId) {
    ImportAnswer__c row = rowOf(campId, answerId);
    if (row == null) {
      return false;
    }
    Database.delete(row, true, AccessLevel.USER_MODE);
    return true;
  }

  /**
   * Undo of a Forget: the forgotten record itself brought back from the recycle bin, so it keeps
   * who answered and when. If it can't be (an import has remembered that question again since),
   * its answer is remembered again as the import would. False when it is nowhere to be found.
   */
  public static Boolean restore(Id campId, Id answerId) {
    List<ImportAnswer__c> rows = [
      SELECT Id, QuestionKey__c, Answer__c
      FROM ImportAnswer__c
      WHERE Id = :answerId AND Camp__c = :campId AND IsDeleted = TRUE
      WITH USER_MODE
      LIMIT 1
      ALL ROWS
    ];
    if (rows.isEmpty()) {
      return false;
    }
    ImportAnswer__c row = rows[0];
    Database.UndeleteResult result = Database.undelete(
      new List<Id>{ row.Id },
      false,
      AccessLevel.USER_MODE
    )[0];
    if (!result.isSuccess()) {
      ImportAnswers.rememberEach(
        campId,
        new Map<String, String>{ row.QuestionKey__c => row.Answer__c }
      );
    }
    return true;
  }

  private static ImportAnswer__c rowOf(Id campId, Id answerId) {
    List<ImportAnswer__c> rows = [
      SELECT Id, QuestionKey__c
      FROM ImportAnswer__c
      WHERE Id = :answerId AND Camp__c = :campId
      WITH USER_MODE
      LIMIT 1
    ];
    return rows.isEmpty() ? null : rows[0];
  }

  private static Learned learnedOf(ImportAnswer__c row) {
    Learned learned = new Learned();
    learned.id = row.Id;
    learned.question = row.QuestionKey__c;
    learned.answer = row.Answer__c;
    learned.byYou = row.LastModifiedById == UserInfo.getUserId();
    learned.byName = String.isBlank(row.LastModifiedBy.FirstName)
      ? row.LastModifiedBy.Name
      : row.LastModifiedBy.FirstName;
    learned.answeredOn = row.LastModifiedDate.date();
    return learned;
  }
}
