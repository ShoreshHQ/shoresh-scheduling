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

    public Result() {
      removed = 0;
      restored = 0;
      keptEdited = new List<String>();
      keptInUse = new List<String>();
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
      done.UndoneAt__c = Datetime.now();
      Database.update(done, AccessLevel.USER_MODE);
    } catch (Exception e) {
      Database.rollback(beforeUndo);
      throw e;
    } finally {
      SetTimeGuard.resume();
    }
    return result;
  }

  private static Import__c load(Id importId) {
    List<Import__c> found = [
      SELECT
        Id,
        Season__c,
        Season__r.Camp__c,
        Created__c,
        Changed__c,
        UndoneAt__c,
        CreatedDate
      FROM Import__c
      WHERE Id = :importId
      WITH USER_MODE
    ];
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

  /** The season's last import that stands. */
  public static Id latest(Id seasonId) {
    List<Import__c> imports = [
      SELECT Id
      FROM Import__c
      WHERE Season__c = :seasonId AND UndoneAt__c = NULL
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Name DESC
      LIMIT 1
    ];
    return imports.isEmpty() ? null : imports[0].Id;
  }
}
