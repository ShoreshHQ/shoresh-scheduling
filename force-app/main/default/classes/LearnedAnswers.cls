/**
 * "What Shoresh has learned" (repo ADR 0021; desktop LearnedScreen.jsx): the answers a camp's
 * imports and setup screens remember (ImportAnswer__c, ADR 0006 §19-21), each with who answered
 * it and when: the record's own Created By and date (no field of its own). So that stays true,
 * a Change here replaces the record (the changer, today) rather than editing it, and Undo brings
 * a record back from the recycle bin (an undelete keeps Created, not Last Modified). Everything runs in
 * user mode and stays inside the camp the screen shows.
 */
public with sharing class LearnedAnswers {
  private static final String CANNOT = 'That answer can\'t be given to this question.';
  // Tests only: the new answer's save refused after the old one was deleted.
  @TestVisible
  private static Boolean refuseSave = false;

  /** The pattern templates (c/shoreshPatterns TEMPLATES): a forgotten pattern names one. */
  private static final Set<String> TEMPLATES = new Set<String>{
    'numbered',
    'meal',
    'spelling',
    'list',
    'together'
  };
  private static final String PATTERN = 'pattern|';
  private static final String FORGOTTEN = 'forgotten';
  private static final Integer MAX_ANTECEDENT = 1000;

  /** One remembered answer, as the screen shows it (sent only, never read back). */
  public class Learned {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String question;
    @AuraEnabled
    public String answer;
    /** The person reading is who answered it. */
    @AuraEnabled
    public Boolean byYou;
    /** Who answered it: their first name (else their name); none for a former user. */
    @AuraEnabled
    public String byName;
    /** When, as a date in the camp's time zone (else the reader's). */
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
  }

  /** The camp's remembered answers, newest first. One query, whatever the number. */
  public static List<Learned> forCamp(Id campId) {
    List<Learned> result = new List<Learned>();
    for (ImportAnswer__c row : [
      SELECT
        Id,
        QuestionKey__c,
        Answer__c,
        Shape__c,
        FromSuggestion__c,
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
      result.add(learnedOf(row));
    }
    return result;
  }

  /**
   * Changes one answer to another of its choices: the old record is forgotten (it stays in the
   * recycle bin for Undo) and a new one saved for the same question, so it shows who changed it
   * and when. Deleted first: the question's key is unique. The new record's Id, or null when the
   * answer is no longer there (forgotten or changed elsewhere): the screen then shows the latest.
   */
  public static Id change(Id campId, Id answerId, String answer) {
    ImportAnswer__c row = rowOf(campId, answerId);
    if (row == null) {
      return null;
    }
    if (!LearnedChoices.allows(row.QuestionKey__c, answer)) {
      throw new ShoreshException(CANNOT);
    }
    ImportAnswer__c replaced = new ImportAnswer__c(
      Camp__c = campId,
      Key__c = row.Key__c,
      QuestionKey__c = row.QuestionKey__c,
      Answer__c = answer,
      // The question's shape stays; an answer picked here was picked without a suggestion.
      Shape__c = row.Shape__c,
      FromSuggestion__c = false
    );
    Savepoint before = Database.setSavepoint();
    try {
      Database.delete(row, true, AccessLevel.USER_MODE);
      if (refuseSave) {
        throw new ShoreshException('Refused.');
      }
      UserModeWrites.save(new List<ImportAnswer__c>{ replaced });
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
    return replaced.Id;
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
   * Forgets a pattern (repo ADR 0021 choice 13; desktop "Forget this pattern"): a marker saved
   * for the camp, "pattern|<template>|<antecedent>", after which the answers saved until now no
   * longer count toward it. The answers themselves stay. A marker from an earlier Forget is
   * replaced (it stays in the recycle bin), so the new one says when. Returns the new marker's
   * Id, then the replaced one's when there was one: Undo deletes the new and brings the old back.
   * The marker is no answer: it names a template from the fixed list, never a record Id.
   */
  public static List<Id> forgetPattern(
    Id campId,
    String template,
    String antecedent
  ) {
    if (
      !TEMPLATES.contains(template) ||
      String.isBlank(antecedent) ||
      antecedent.length() > MAX_ANTECEDENT
    ) {
      throw new ShoreshException('That isn\'t a pattern Shoresh knows.');
    }
    String question = PATTERN + template + '|' + antecedent;
    String key = ImportAnswers.keyOf(campId, question);
    List<ImportAnswer__c> before = [
      SELECT Id
      FROM ImportAnswer__c
      WHERE Key__c = :key AND Camp__c = :campId
      WITH USER_MODE
      LIMIT 1
    ];
    ImportAnswer__c marker = new ImportAnswer__c(
      Camp__c = campId,
      Key__c = key,
      QuestionKey__c = question,
      Answer__c = FORGOTTEN
    );
    Savepoint start = Database.setSavepoint();
    try {
      Database.delete(before, true, AccessLevel.USER_MODE);
      UserModeWrites.save(new List<ImportAnswer__c>{ marker });
    } catch (Exception e) {
      Database.rollback(start);
      throw e;
    }
    List<Id> result = new List<Id>{ marker.Id };
    if (!before.isEmpty()) {
      result.add(before[0].Id);
    }
    return result;
  }

  private static ImportAnswer__c rowOf(Id campId, Id answerId) {
    List<ImportAnswer__c> rows = [
      SELECT Id, Key__c, QuestionKey__c, Shape__c
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
    learned.byYou = row.CreatedById == UserInfo.getUserId();
    learned.byName = ImportAnswers.byNameOf(row);
    learned.answeredOn = ImportAnswers.answeredOnOf(row);
    learned.savedAt = row.CreatedDate;
    learned.shape = row.Shape__c;
    learned.fromSuggestion = row.FromSuggestion__c == true;
    return learned;
  }
}
