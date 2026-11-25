/**
 * What later imports still standing changed, for Undo (API-2.6). Each source (the director, or
 * one outside system) undoes only its own last import, so a later import from another source
 * may have changed what this one made: that record is theirs too now, and is kept, as anything
 * edited since is.
 */
public with sharing class ImportUndoLater {
  // Logs read at once: 10 at the longest (131,072 characters) is about 1.3 million.
  @TestVisible
  private static Integer logsAtOnce = 10;
  // Queries for the logs: past them, Undo says so rather than leave later imports unread.
  @TestVisible
  private static Integer queryBudget = 30;
  private Set<Id> changed = new Set<Id>();

  /** Every later import standing: listed first (Ids only), then its log read a few at a time. */
  public ImportUndoLater(Import__c done) {
    List<Id> laterIds = new List<Id>();
    for (Import__c later : [
      SELECT Id
      FROM Import__c
      WHERE
        Season__c = :done.Season__c
        AND CreatedDate >= :done.CreatedDate
        AND Id != :done.Id
        AND UndoneAt__c = NULL
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Id
    ]) {
      laterIds.add(later.Id);
    }
    Integer queries = 0;
    for (Integer i = 0; i < laterIds.size(); i += logsAtOnce) {
      if (queries == queryBudget) {
        // Shoresh's own refusal (CORE-6.15): no support code.
        throw new ShoreshException(
          'There have been too many imports since this one for Shoresh to check what they changed, so nothing was undone.'
        );
      }
      List<Id> batch = new List<Id>();
      for (Integer j = i; j < Math.min(i + logsAtOnce, laterIds.size()); j++) {
        batch.add(laterIds[j]);
      }
      readLogs(batch);
      queries++;
    }
  }

  /** What these imports changed, from their logs. */
  private void readLogs(List<Id> importIds) {
    for (Import__c later : [
      SELECT Changed__c
      FROM Import__c
      WHERE Id IN :importIds
      WITH USER_MODE
    ]) {
      if (String.isNotBlank(later.Changed__c)) {
        addIds(ImportLogEntries.read(later.Changed__c).recordValues);
      }
    }
  }

  private void addIds(List<ImportLogEntries.Values> entries) {
    for (ImportLogEntries.Values entry : entries) {
      Id recordId = entry.namedId();
      if (recordId != null) {
        changed.add(recordId);
      }
    }
  }

  /**
   * Whether a record the import made was changed since: by a later import from another source,
   * or by anyone, as its written fields no longer match what the import wrote.
   */
  public Boolean edited(SObject record, List<String> written, String digest) {
    return changed.contains(record.Id) ||
      ImportUndoValues.digest(record, written) != digest;
  }
}
