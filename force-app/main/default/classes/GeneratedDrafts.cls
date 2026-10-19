/**
 * Generated Schedule's draft: one per program and week (Status Draft, Origin Generated), beside
 * Manual Build's (Greg, 2026-10-17: two separate schedules). It is made by the first save of a
 * generated week, under the program's lock, as ManualDrafts.start does. Runs in user mode.
 */
public with sharing class GeneratedDrafts {
  public static final String GENERATED = 'Generated';
  public static final String NAME = 'Generated Schedule';

  /** The program's Generated draft for the week, or null when there is none yet. */
  public static Schedule__c find(Id programId, Id weekId) {
    List<Schedule__c> found = [
      SELECT Id, Name, EngineOption__c
      FROM Schedule__c
      WHERE
        Program__c = :programId
        AND Week__c = :weekId
        AND Status__c = :ManualDrafts.DRAFT
        AND Origin__c = :GENERATED
      WITH USER_MODE
      ORDER BY CreatedDate, Id
      LIMIT 1
    ];
    return found.isEmpty() ? null : found[0];
  }

  /**
   * Locks the program until this save ends, so two first saves of the same week take turns and
   * the second finds the first one's draft.
   */
  public static void lockProgram(Id programId) {
    List<Program__c> locked = [
      SELECT Id
      FROM Program__c
      WHERE Id = :programId
      WITH USER_MODE
      FOR UPDATE
    ];
    if (locked.isEmpty()) {
      throw new ShoreshException(
        'That program was not found, or you do not have access to it.'
      );
    }
  }

  /**
   * A Generated draft of the program's week, locked until this save ends. A version, a published
   * schedule, or Manual Build's draft can't be changed here.
   */
  public static Schedule__c locked(Id scheduleId, Id programId, Id weekId) {
    Schedule__c draft = lockedToEdit(scheduleId);
    if (draft.Program__c != programId || draft.Week__c != weekId) {
      throw notHere(draft);
    }
    return draft;
  }

  /** A Generated draft, locked until this save ends (a hand edit or a lock names only it). */
  public static Schedule__c lockedToEdit(Id scheduleId) {
    List<Schedule__c> found = [
      SELECT
        Id,
        Name,
        Status__c,
        Origin__c,
        EngineOption__c,
        Program__c,
        Week__c,
        Program__r.Id,
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
    Schedule__c draft = found[0];
    // The camp's words are read only for a refusal.
    if (draft.Status__c != ManualDrafts.DRAFT) {
      CampLabels labels = CampLabels.forCamp(
        draft.Program__r.Season__r.Camp__c
      );
      throw new ShoreshException(
        'A saved ' +
          labels.singularInSentence('Version') +
          ' can\'t be changed.'
      );
    }
    if (draft.Origin__c != GENERATED) {
      throw notHere(draft);
    }
    return draft;
  }

  private static ShoreshException notHere(Schedule__c draft) {
    CampLabels labels = CampLabels.forCamp(draft.Program__r.Season__r.Camp__c);
    return new ShoreshException(
      'Only this ' +
        labels.singularInSentence('Week') +
        '\'s Generated Schedule can be saved here. Reload the page.'
    );
  }

  /**
   * What the draft's days were last saved at, as one piece of text ("2026-06-29:3,..."): the
   * schedule-level revision check (ADR 0005 §9) compares it whole. Empty when there is no draft.
   * It is ScheduleDays.stamp, so a publish preview's revisions can be compared with it.
   */
  public static String revisionOf(List<ScheduleDays.DayGrid> days) {
    return ScheduleDays.stamp(days);
  }
}
