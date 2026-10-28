/**
 * Undo last import (Greg, 2026-10-16): removes what the import created, its version included,
 * and puts back what it changed, but keeps anything edited since or still in use, and says
 * which. Only the season's most recent import can be undone, and only once (Greg, 2026-10-17):
 * once it is undone, no earlier import can be undone until the next import. Setup lists
 * imported on a screen (slice 4c) are imports too.
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

    public Result() {
      removed = 0;
      restored = 0;
      keptEdited = new List<String>();
      keptInUse = new List<String>();
      gone = new List<String>();
    }
  }

  /** Undo takes away what the import made, its imported week too, which nothing else may delete. */
  private static void deleteCreated(Result result, Import__c done) {
    ImportedWeekGuard.allow();
    try {
      new ImportUndoDeletes(result)
        .run((Map<String, Object>) JSON.deserializeUntyped(done.Created__c));
    } finally {
      ImportedWeekGuard.done();
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
    try {
      // Put back first (a group moved into a division the import made goes home), then remove.
      Map<String, List<Object>> sorted = ImportUndoEntries.sorted(done);
      List<Object> changes = sorted.get('changes');
      List<Object> wordsOff = sorted.get('wordOff');
      Id campId = touchesCampWords(done, changes, wordsOff)
        ? campOf(done.Season__c)
        : null;
      if (campId != null) {
        // Camp words are shared by the camp's seasons: another season's import waits.
        lockCamp(campId);
      }
      new ImportUndoRemovals(result).run(sorted.get('removed'));
      new ImportUndoRestores(result).run(changes);
      new ImportUndoWho(result).run(sorted.get('who'));
      new ImportUndoWeeksOff(result, done.Season__c).run(sorted.get('weekOn'));
      new ImportUndoWords(result, campId).run(wordsOff);
      deleteCreated(result, done);
      SetTimeGuard.checkPending();
      ImportLog.markUndone(done);
    } catch (Exception e) {
      Database.rollback(beforeUndo);
      throw e;
    } finally {
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
        SELECT Id, Season__c, Created__c, Changed__c, UndoneAt__c
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
    if (latest(done.Season__c) != done.Id) {
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

  /** Whether Undo changes camp words: one the import added, changed, or set back. */
  private static Boolean touchesCampWords(
    Import__c done,
    List<Object> changes,
    List<Object> wordsOff
  ) {
    if (
      !wordsOff.isEmpty() ||
      ((Map<String, Object>) JSON.deserializeUntyped(done.Created__c))
        .containsKey('CampLabel')
    ) {
      return true;
    }
    for (Object entry : changes) {
      if (
        ImportFields.ofRecord(((Map<String, Object>) entry).get('id')) ==
        CampLabel__c.SObjectType
      ) {
        return true;
      }
    }
    return false;
  }

  private static Id campOf(Id seasonId) {
    return [SELECT Camp__c FROM Season__c WHERE Id = :seasonId WITH USER_MODE]
    .Camp__c;
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
}
