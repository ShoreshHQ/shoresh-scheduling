/**
 * An import's own record (Import__c): what "Undo last import" reads and marks. Schedulers can
 * read imports but not create, edit, or delete them (security audit, 2026-10-17), so no one
 * can rewrite what Undo trusts, add a blank import that becomes "the last one", or undo an
 * import twice by hand. Only these methods write Import__c, in system mode, after checking the
 * person's own edit access to that season (ADR 0001 point 6). Every change to the camp's setup
 * stays user mode.
 */
public with sharing class ImportLog {
  /** Records an import into a season the person can edit. */
  public static Id record(ImportPlan plan, String created, String changed) {
    requireEditAccess(plan.seasonId);
    String files = plan.text('files');
    Import__c done = new Import__c(
      Season__c = plan.seasonId,
      Files__c = String.isBlank(files) ? null : files.left(255),
      Created__c = created,
      Changed__c = changed
    );
    Database.insert(done, AccessLevel.SYSTEM_MODE);
    return done.Id;
  }

  /** Marks an import undone, once Undo has put everything back in user mode. */
  public static void markUndone(Id importId) {
    // An import is controlled by its season: edit access to it is edit access to the season.
    requireEditAccess(importId);
    Database.update(
      new Import__c(Id = importId, UndoneAt__c = Datetime.now()),
      AccessLevel.SYSTEM_MODE
    );
  }

  /**
   * The person may read imports (Shoresh Scheduler) and edit this record. Read in system mode:
   * UserRecordAccess is the platform's own answer about this person (as CampLabels does).
   */
  private static void requireEditAccess(Id recordId) {
    List<UserRecordAccess> access = [
      SELECT RecordId, HasEditAccess
      FROM UserRecordAccess
      WHERE UserId = :UserInfo.getUserId() AND RecordId = :recordId
      WITH SYSTEM_MODE
    ];
    if (
      !Schema.SObjectType.Import__c.isAccessible() ||
      access.isEmpty() ||
      !access[0].HasEditAccess
    ) {
      throw new ShoreshException(
        'You don\'t have edit access to this ' +
          CampLabels.modelTermsOnly().singularInSentence('Season') +
          '. Ask the person who set it up, or a Salesforce admin.'
      );
    }
  }
}
