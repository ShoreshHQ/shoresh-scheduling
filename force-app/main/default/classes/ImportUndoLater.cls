/**
 * What later imports still standing changed, for Undo (API-2.6). Each source (the director, or
 * one outside system) undoes only its own last import, so a later import from another source
 * may have changed what this one made: that record is theirs too now, and is kept, as anything
 * edited since is.
 */
public with sharing class ImportUndoLater {
  private Set<Id> changed = new Set<Id>();

  /** Every later import standing, read a part at a time (each log can be long). */
  public ImportUndoLater(Import__c done) {
    for (List<Import__c> part : [
      SELECT Changed__c
      FROM Import__c
      WHERE
        Season__c = :done.Season__c
        AND CreatedDate >= :done.CreatedDate
        AND Id != :done.Id
        AND UndoneAt__c = NULL
      WITH USER_MODE
      ORDER BY CreatedDate DESC
    ]) {
      for (Import__c later : part) {
        if (String.isNotBlank(later.Changed__c)) {
          addIds(ImportLogEntries.read(later.Changed__c).recordValues);
        }
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
