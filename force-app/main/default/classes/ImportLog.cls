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
  // Imports of a season whose kept files are looked for: more than a season ever has.
  private static final Integer MAX_IMPORTS = 200;

  /** Open questions of the last import recorded that did not fit in it (INGEST-5.5). */
  public static Integer openNotKept { get; private set; }

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
    // Files kept for earlier imports' questions are no longer needed: this import supersedes them.
    deleteFiles(earlierImports(plan.seasonId, done.Id));
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
   * Records a batch from another system (IncomingSave; API-2.3) as an import of the season, so
   * Undo last import takes it back and Roots shows its questions. A sending key holds no access
   * to imports and need not edit the season: it must only see it (it found it in user mode), and
   * every record it changed was written in user mode before this.
   */
  public static Id recordIncoming(Import__c done) {
    requireReadAccess(done.Season__c);
    Database.insert(done, AccessLevel.SYSTEM_MODE);
    return done.Id;
  }

  /** A batch's new questions, added to the last import (itself a batch), by the same rule. */
  public static void updateIncomingQuestions(Import__c last) {
    requireReadAccess(last.Season__c);
    Database.update(
      new Import__c(Id = last.Id, Open__c = last.Open__c),
      AccessLevel.SYSTEM_MODE
    );
  }

  private static void requireReadAccess(Id seasonId) {
    List<UserRecordAccess> access = [
      SELECT RecordId, HasReadAccess
      FROM UserRecordAccess
      WHERE UserId = :UserInfo.getUserId() AND RecordId = :seasonId
      WITH SYSTEM_MODE
    ];
    if (access.isEmpty() || !access[0].HasReadAccess) {
      throw new ShoreshException(
        'This user can\'t see that season. Ask a Salesforce admin to share it.'
      );
    }
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
    Integer asked = open.size();
    String text = JSON.serialize(open);
    while (!open.isEmpty() && text.length() > OPEN_LIMIT) {
      open.remove(open.size() - 1);
      text = JSON.serialize(open);
    }
    openNotKept = asked - open.size();
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
    // Its kept files go with it (INGEST-5.5).
    deleteFiles(new Set<Id>{ done.Id });
    Database.update(
      new Import__c(Id = done.Id, UndoneAt__c = Datetime.now()),
      AccessLevel.SYSTEM_MODE
    );
  }

  /** The season's other imports (the newest), whose kept files a new import supersedes. */
  private static Set<Id> earlierImports(Id seasonId, Id newest) {
    return new Map<Id, Import__c>(
        [
          SELECT Id
          FROM Import__c
          WHERE Season__c = :seasonId AND Id != :newest
          WITH USER_MODE
          ORDER BY CreatedDate DESC
          LIMIT :MAX_IMPORTS
        ]
      )
      .keySet();
  }

  /**
   * Deletes the files kept with these imports (INGEST-5.5): kept only while their questions are
   * open. In system mode, as they were kept: the person deleting may not be the one who saved
   * them, and their edit access to the season was checked first.
   */
  private static void deleteFiles(Set<Id> importIds) {
    if (importIds.isEmpty()) {
      return;
    }
    Set<Id> documents = new Set<Id>();
    for (ContentDocumentLink link : [
      SELECT ContentDocumentId
      FROM ContentDocumentLink
      WHERE LinkedEntityId IN :importIds
      WITH SYSTEM_MODE
    ]) {
      documents.add(link.ContentDocumentId);
    }
    List<ContentDocument> files = new List<ContentDocument>();
    for (Id documentId : documents) {
      files.add(new ContentDocument(Id = documentId));
    }
    if (!files.isEmpty()) {
      Database.delete(files, AccessLevel.SYSTEM_MODE);
    }
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
