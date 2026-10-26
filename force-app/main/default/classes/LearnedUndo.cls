/**
 * Undo on "What Shoresh has learned" (repo ADR 0021 choice 6): a forgotten answer, or the answer
 * a Change replaced, brought back from the recycle bin, so it keeps who answered it and when
 * (an undelete keeps Created By and date). Never over a newer answer: when an import has
 * answered the question since, nothing changes and the screen shows the latest. User mode,
 * inside the camp the screen shows.
 */
public with sharing class LearnedUndo {
  // Tests only: an undelete that fails, as when the recycle bin no longer holds the record.
  @TestVisible
  private static Boolean refuseUndelete = false;

  /** Undo of a Forget. False when it can't come back (see above). */
  public static Boolean forget(Id campId, Id answerId) {
    ImportAnswer__c old = forgotten(campId, answerId);
    return old != null && undeleted(old.Id);
  }

  /**
   * Undo of a Change: the new record forgotten and the old one back. False, with nothing
   * changed, when either is not as the Change left it.
   */
  public static Boolean change(Id campId, Id newId, Id oldId) {
    ImportAnswer__c old = forgotten(campId, oldId);
    List<ImportAnswer__c> current = [
      SELECT Id, CreatedDate, CreatedById, LastModifiedDate, LastModifiedById
      FROM ImportAnswer__c
      WHERE Id = :newId AND Camp__c = :campId
      WITH USER_MODE
      LIMIT 1
    ];
    if (old == null || current.isEmpty() || changedSince(current[0])) {
      return false;
    }
    Savepoint before = Database.setSavepoint();
    Database.delete(current[0], true, AccessLevel.USER_MODE);
    if (!undeleted(old.Id)) {
      Database.rollback(before);
      return false;
    }
    return true;
  }

  /** Saved again after the Change made it (an import's answer), by anyone. */
  private static Boolean changedSince(ImportAnswer__c row) {
    return row.LastModifiedDate != row.CreatedDate ||
      row.LastModifiedById != row.CreatedById;
  }

  /** This camp's answer in the recycle bin, or null. */
  private static ImportAnswer__c forgotten(Id campId, Id answerId) {
    List<ImportAnswer__c> rows = [
      SELECT Id
      FROM ImportAnswer__c
      WHERE Id = :answerId AND Camp__c = :campId AND IsDeleted = TRUE
      WITH USER_MODE
      LIMIT 1
      ALL ROWS
    ];
    return rows.isEmpty() ? null : rows[0];
  }

  /** Brought back, unless a newer answer to its question holds the key. */
  private static Boolean undeleted(Id answerId) {
    if (refuseUndelete) {
      return false;
    }
    return Database.undelete(
        new List<Id>{ answerId },
        false,
        AccessLevel.USER_MODE
      )[0]
      .isSuccess();
  }
}
