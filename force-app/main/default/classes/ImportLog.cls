/**
 * An import's own record (Import__c): what "Undo last import" reads and marks. Its Created__c,
 * Changed__c and UndoneAt__c are read-only to schedulers (security audit, 2026-10-17), so no
 * one can rewrite what Undo trusts or undo an import twice by hand; Import__c can't be deleted
 * by them either. Only these methods write those three fields, in system mode, on the one
 * record the import itself just made or Undo just checked (ADR 0001 point 6).
 */
public with sharing class ImportLog {
  /**
   * Records an import: created in user mode (the person's own access to imports and to the
   * season), then its log written in system mode.
   */
  public static Id record(ImportPlan plan, String created, String changed) {
    String files = plan.text('files');
    Import__c done = new Import__c(
      Season__c = plan.seasonId,
      Files__c = String.isBlank(files) ? null : files.left(255)
    );
    Database.insert(done, AccessLevel.USER_MODE);
    Database.update(
      new Import__c(Id = done.Id, Created__c = created, Changed__c = changed),
      AccessLevel.SYSTEM_MODE
    );
    return done.Id;
  }

  /** Marks an import undone, once Undo has put everything back in user mode. */
  public static void markUndone(Id importId) {
    if (!Schema.SObjectType.Import__c.isUpdateable()) {
      throw new ShoreshException(
        'You don\'t have access to undo imports. Ask a Salesforce admin.'
      );
    }
    Database.update(
      new Import__c(Id = importId, UndoneAt__c = Datetime.now()),
      AccessLevel.SYSTEM_MODE
    );
  }
}
