/**
 * Undo last import (Greg, 2026-10-16): removes what the import created, its version included,
 * and puts back what it changed, but keeps anything edited since or still in use, and says
 * which. Only the season's most recent import can be undone, and only once (Greg, 2026-10-17):
 * once it is undone, no earlier import can be undone until the next import. Setup lists
 * imported on a screen (slice 4c) are imports too, and so is Copy season (Greg, 2026-11-02). The
 * director's imports and each outside system's batches each have their own last import, undone
 * on its own (API-2.6). Undo last import restores the camp as it was (docs/import/review.md
 * INGEST-5.10): this class finds and holds the import; its log is put back by ImportUndoLog.
 */
public with sharing class ImportUndo {
  /** What Undo did, for the screen. */
  public class Result {
    @AuraEnabled
    public Integer removed { get; set; }
    @AuraEnabled
    public Integer restored { get; set; }
    @AuraEnabled
    public List<String> keptEdited { get; set; }
    @AuraEnabled
    public List<String> keptInUse { get; set; }
    /** Records the import changed that were deleted since: nothing to put back. */
    @AuraEnabled
    public List<String> gone { get; set; }
    /** A copied season the Undo took away with everything in it: the screen leaves it. */
    @AuraEnabled
    public Boolean seasonRemoved;

    public Result() {
      removed = 0;
      restored = 0;
      keptEdited = new List<String>();
      keptInUse = new List<String>();
      gone = new List<String>();
      seasonRemoved = false;
    }
  }

  public static Result undo(Id importId) {
    Import__c done = withLog(load(importId));
    // Before anything is put back: someone who can only read the season is told so plainly,
    // not refused part-way by one of the records.
    ImportLog.requireEditAccess(done.Season__c);
    Result result = new Result();
    SetTimeGuard.defer();
    Savepoint beforeUndo = Database.setSavepoint();
    // Undoing a batch from another system puts a camper's name and bunk back (API-4.2); no other
    // import may change them.
    OutsideOwned.bringingIn = IncomingQuestions.isBatch(done.Open__c);
    try {
      ImportUndoLog.reverse(done, result);
      // Undoing Copy season takes the new season away, its import log with it.
      result.seasonRemoved =
        [
          SELECT COUNT()
          FROM Season__c
          WHERE Id = :done.Season__c
          WITH USER_MODE
        ] == 0;
      SetTimeGuard.checkPending();
      if (!result.seasonRemoved) {
        ImportLog.markUndone(done);
      }
    } catch (Exception e) {
      Database.rollback(beforeUndo);
      throw e;
    } finally {
      OutsideOwned.bringingIn = false;
      SetTimeGuard.resume();
    }
    return result;
  }

  /** An import's log is the server's (ImportLog): one without it is never acted on. */
  private static Import__c withLog(Import__c done) {
    if (String.isBlank(done.Created__c) || String.isBlank(done.Changed__c)) {
      throw ImportFields.unreadableLog();
    }
    return done;
  }

  /**
   * Why Undo stopped, with the record and the reason in Shoresh's words (ScreenErrors: never the
   * platform's own wording): nothing was undone.
   */
  public static ShoreshException refused(
    String name,
    String what,
    Database.Error error
  ) {
    return new ShoreshException(
      'Nothing was undone. ' +
        name +
        ': ' +
        what +
        '. ' +
        ScreenErrors.messageOf(error)
    );
  }

  private static Import__c load(Id importId) {
    List<Import__c> found = [
      SELECT Season__c
      FROM Import__c
      WHERE Id = :importId
      WITH USER_MODE
    ];
    if (!found.isEmpty()) {
      // A second Undo, or an import saving, in the same season waits here; read again after.
      lockSeason(found[0].Season__c);
      found = [
        SELECT
          Id,
          Season__c,
          Created__c,
          Changed__c,
          UndoneAt__c,
          Open__c,
          Source__c,
          CreatedDate
        FROM Import__c
        WHERE Id = :importId
        WITH USER_MODE
      ];
    }
    if (found.isEmpty() || found[0].UndoneAt__c != null) {
      throw new ShoreshException(
        'That import was already undone, or it was not found.'
      );
    }
    Import__c done = found[0];
    if (latestFrom(done.Season__c, done.Source__c) != done.Id) {
      throw new ShoreshException('Only the last import can be undone.');
    }
    return done;
  }

  /**
   * Holds the season until this save or Undo is done, so imports and Undos in one season take
   * turns: Undo can't run while an import saves, or twice at once.
   */
  public static void lockSeason(Id seasonId) {
    List<Season__c> locked = [
      SELECT Id
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
      FOR UPDATE
    ];
    if (locked.isEmpty()) {
      throw new ShoreshException(
        'That import was already undone, or it was not found.'
      );
    }
  }

  /**
   * Holds the camp until this save or Undo is done, when it changes camp words: they are the
   * camp's, so two seasons' imports (or Undos) can't interleave their changes to them.
   */
  public static void lockCamp(Id campId) {
    List<Camp__c> locked = [
      SELECT Id
      FROM Camp__c
      WHERE Id = :campId
      WITH USER_MODE
      FOR UPDATE
    ];
    if (locked.isEmpty()) {
      throw new ShoreshException(
        'That camp was not found, or you do not have access to it.'
      );
    }
  }

  /**
   * The season's most recent import, undone or not (Greg, 2026-10-17): Undo is offered for it
   * only, once. After it is undone no earlier import can be undone, until the next import.
   */
  public static Id latest(Id seasonId) {
    List<Import__c> imports = [
      SELECT Id
      FROM Import__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Name DESC
      LIMIT 1
    ];
    return imports.isEmpty() ? null : imports[0].Id;
  }

  /**
   * The season's most recent import from one source, undone or not (API-2.6): the director's own
   * (source blank) or one outside system's. Each has its own Undo, so a batch from another system
   * never takes the director's Undo away, nor the director's import a system's.
   */
  public static Id latestFrom(Id seasonId, String source) {
    String key = String.isBlank(source) ? null : source;
    List<Import__c> imports = [
      SELECT Id
      FROM Import__c
      WHERE Season__c = :seasonId AND Source__c = :key
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Name DESC
      LIMIT 1
    ];
    // Text is compared without case: "CampMinder" and "campminder" are one system.
    return imports.isEmpty() ? null : imports[0].Id;
  }
}
