/**
 * Generated Schedule's draft: one per program and week (Status Draft, Origin Generated), beside
 * Manual Build's (Greg, 2026-10-17: two separate schedules). It is made by the first save of a
 * generated week, or by a Restore on a week not generated yet (startFrom), under the program's
 * lock, as ManualDrafts.start does. Runs in user mode.
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

  /**
   * Restore on a week not generated yet (Greg's decision 9: any version opens here): the version
   * becomes the week's Generated draft, as ManualVersions.restoreInto brings it into one (its
   * option, its locks, the placed cells of a version it didn't build locked). There is nothing to keep
   * first. False, with nothing written, when the week got its Generated draft meanwhile; the
   * screen then offers Reload.
   */
  public static Boolean startFrom(Id programId, Id weekId, Id versionId) {
    lockProgram(programId);
    if (find(programId, weekId) != null) {
      return false;
    }
    Savepoint beforeStart = Database.setSavepoint();
    try {
      Schedule__c draft = new Schedule__c(
        Program__c = programId,
        Week__c = weekId,
        Name = NAME,
        Status__c = ManualDrafts.DRAFT,
        Origin__c = GENERATED,
        EngineOption__c = 1
      );
      Database.insert(draft, AccessLevel.USER_MODE);
      // A new draft has no days, so the revision it was "seen" at is empty.
      ManualVersions.restoreInto(lockedToEdit(draft.Id), versionId, '');
      return true;
    } catch (Exception e) {
      Database.rollback(beforeStart);
      throw e;
    }
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
