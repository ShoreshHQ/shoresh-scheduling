/**
 * Manual Build's draft: one per program and week (Status Draft, Origin Manual), the schedule a
 * director builds by hand. Starting one is "Start a blank week". Two people starting the same week
 * at once get the same draft: the start locks the program, then looks again. Runs in user mode.
 */
public with sharing class ManualDrafts {
  public static final String DRAFT = 'Draft';
  public static final String MANUAL = 'Manual';
  public static final String NAME = 'Manual Build';

  /** The program's Manual Build draft for the week, or null when there is none yet. */
  public static Schedule__c find(Id programId, Id weekId) {
    List<Schedule__c> found = [
      SELECT Id, Name
      FROM Schedule__c
      WHERE
        Program__c = :programId
        AND Week__c = :weekId
        AND Status__c = :DRAFT
        AND Origin__c = :MANUAL
      WITH USER_MODE
      ORDER BY CreatedDate, Id
      LIMIT 1
    ];
    return found.isEmpty() ? null : found[0];
  }

  /** Starts a blank week, or returns the draft someone already started. */
  public static Id start(Id programId, Id weekId) {
    List<Program__c> locked = [
      SELECT Id
      FROM Program__c
      WHERE Id = :programId
      WITH USER_MODE
      FOR UPDATE
    ];
    if (locked.isEmpty()) {
      throw new ShoreshException(
        'That was not found, or you do not have access to it.'
      );
    }
    // Looked for again under the lock: a start that waited sees the one before it.
    Schedule__c existing = find(programId, weekId);
    if (existing != null) {
      return existing.Id;
    }
    List<ScheduleDaySaves.DaySave> days = BlankWeek.days(programId, weekId);
    Savepoint beforeStart = Database.setSavepoint();
    try {
      Schedule__c draft = new Schedule__c(
        Program__c = programId,
        Week__c = weekId,
        Name = NAME,
        Status__c = DRAFT,
        Origin__c = MANUAL
      );
      Database.insert(draft, AccessLevel.USER_MODE);
      ScheduleDaySaves.write(draft.Id, days);
      return draft.Id;
    } catch (Exception e) {
      Database.rollback(beforeStart);
      throw e;
    }
  }

  /**
   * A draft, locked until this save ends, so saves of one schedule take turns. A version (or a
   * published schedule) can't be changed.
   */
  public static Schedule__c locked(Id scheduleId) {
    List<Schedule__c> found = [
      SELECT
        Id,
        Status__c,
        Program__c,
        Program__r.Season__c,
        Program__r.Season__r.Camp__c
      FROM Schedule__c
      WHERE Id = :scheduleId
      WITH USER_MODE
      FOR UPDATE
    ];
    if (found.isEmpty()) {
      throw new ShoreshException(
        'That schedule was not found, or you do not have access to it.'
      );
    }
    if (found[0].Status__c != DRAFT) {
      CampLabels labels = CampLabels.forCamp(
        found[0].Program__r.Season__r.Camp__c
      );
      throw new ShoreshException(
        'A saved ' +
          labels.singularInSentence('Version') +
          ' can\'t be changed.'
      );
    }
    return found[0];
  }
}
