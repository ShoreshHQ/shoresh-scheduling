/**
 * Undo last import (Greg, 2026-10-16): removes what the import created, its version included,
 * and puts back what it changed, but keeps anything edited since or still in use, and says
 * which. Only a season's last import that has not been undone can be undone.
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

  public static Result undo(Id importId) {
    Import__c done = load(importId);
    Result result = new Result();
    SetTimeGuard.defer();
    Savepoint beforeUndo = Database.setSavepoint();
    try {
      // Put back first (a group moved into a division the import made goes home), then remove.
      new ImportUndoRestores(result)
        .run((List<Object>) JSON.deserializeUntyped(done.Changed__c));
      new ImportUndoDeletes(result)
        .run((Map<String, Object>) JSON.deserializeUntyped(done.Created__c));
      SetTimeGuard.checkPending();
      // Only the field that changes: the season it is in can't be sent back in user mode.
      Database.update(
        new Import__c(Id = done.Id, UndoneAt__c = Datetime.now()),
        AccessLevel.USER_MODE
      );
    } catch (Exception e) {
      Database.rollback(beforeUndo);
      throw e;
    } finally {
      SetTimeGuard.resume();
    }
    return result;
  }

  /** Why Undo stopped, with the record and Salesforce's reason: nothing was undone. */
  public static ShoreshException refused(
    String name,
    String what,
    Database.Error error
  ) {
    return new ShoreshException(
      'Nothing was undone. ' + name + ': ' + what + '. ' + error.getMessage()
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
