/**
 * An import's own record (Import__c): what "Undo last import" reads and marks. Schedulers can
 * read imports but not create, edit, or delete them (security audit, 2026-10-17), so no one
 * can rewrite what Undo trusts, add a blank import that becomes "the last one", or undo an
 * import twice by hand. Only these methods write Import__c, in system mode, after checking the
 * person's own edit access to that season (ADR 0001 point 6). Every change to the camp's setup
 * stays user mode.
 */
public with sharing class ImportLog {
  // Import__c.Open__c's length.
  private static final Integer OPEN_LIMIT = 131072;

  /** Records an import into a season the person can edit. */
  public static Id record(ImportPlan plan, String created, String changed) {
    requireEditAccess(plan.seasonId);
    String files = plan.text('files');
    String open = openQuestions(plan);
    Import__c done = new Import__c(
      Season__c = plan.seasonId,
      Files__c = String.isBlank(files) ? null : files.left(255),
      Created__c = created,
      Changed__c = changed,
      Open__c = open
    );
    Database.insert(done, AccessLevel.SYSTEM_MODE);
    String read = plan.text('fileData');
    if (open != null && !String.isBlank(read)) {
      // The files as read, so the open questions can be answered later (INGEST-5.5). Kept
      // with the import's record, in system mode for the same reason as the record itself;
      // anyone who can read the import can read them.
      Database.insert(
        new ContentVersion(
          Title = 'Import files',
          PathOnClient = 'import-files.json',
          VersionData = Blob.valueOf(read),
          FirstPublishLocationId = done.Id
        ),
        AccessLevel.SYSTEM_MODE
      );
    }
    return done.Id;
  }

  /**
   * The questions the director left open (INGEST-5.5), as JSON [{ key, title }], or null for
   * none. As many as the field holds; the rest wait for the next import of the same files.
   */
  private static String openQuestions(ImportPlan plan) {
    List<Map<String, String>> open = new List<Map<String, String>>();
    for (ImportPlan.Entry entry : plan.entries('open')) {
      open.add(
        new Map<String, String>{
          'key' => entry.text('key'),
          'title' => entry.text('title')
        }
      );
    }
    String text = JSON.serialize(open);
    while (!open.isEmpty() && text.length() > OPEN_LIMIT) {
      open.remove(open.size() - 1);
      text = JSON.serialize(open);
    }
    return open.isEmpty() ? null : text;
  }

  /**
   * The files of the season's last import, as it read them, while it has questions open
   * (INGEST-5.5); refused for any other import.
   */
  public static String openFiles(Id importId) {
    List<Import__c> found = [
      SELECT Id, Season__c, Open__c, UndoneAt__c
      FROM Import__c
      WHERE Id = :importId
      WITH USER_MODE
    ];
    if (
      found.isEmpty() ||
      found[0].UndoneAt__c != null ||
      String.isBlank(found[0].Open__c) ||
      ImportUndo.latest(found[0].Season__c) != importId
    ) {
      throw new ShoreshException(
        'Those questions were answered or undone since. Open Import last year again from Roots.'
      );
    }
    List<ContentVersion> files = [
      SELECT VersionData
      FROM ContentVersion
      WHERE FirstPublishLocationId = :importId AND IsLatest = TRUE
      WITH USER_MODE
      ORDER BY CreatedDate DESC
      LIMIT 1
    ];
    if (files.isEmpty()) {
      throw new ShoreshException(
        'The files of that import can\'t be read. Import them again from Roots.'
      );
    }
    return files[0].VersionData.toString();
  }

  /** Marks an import undone, once Undo has put everything back in user mode. */
  public static void markUndone(Import__c done) {
    // An import is controlled by its season (and schedulers have no edit on imports
    // themselves): the season is what the person must be able to edit.
    requireEditAccess(done.Season__c);
    Database.update(
      new Import__c(Id = done.Id, UndoneAt__c = Datetime.now()),
      AccessLevel.SYSTEM_MODE
    );
  }

  /**
   * The person may read imports (Shoresh Scheduler) and edit this record. Read in system mode:
   * UserRecordAccess is the platform's own answer about this person (as CampLabels does).
   */
  public static void requireEditAccess(Id recordId) {
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
