/**
 * What later imports still standing changed, for Undo (API-2.6). Each source (the director, or
 * one outside system) undoes only its own last import, so a later import from another source
 * may have changed what this one made: that record is theirs too now, and is kept, as anything
 * edited since is.
 */
public with sharing class ImportUndoLater {
  // Later imports read for what they changed: more than stand at once in a season.
  private static final Integer LATER_LIMIT = 50;
  private Set<Id> changed = new Set<Id>();

  public ImportUndoLater(Import__c done) {
    for (Import__c later : [
      SELECT Changed__c
      FROM Import__c
      WHERE
        Season__c = :done.Season__c
        AND CreatedDate >= :done.CreatedDate
        AND Id != :done.Id
        AND UndoneAt__c = NULL
      WITH USER_MODE
      ORDER BY CreatedDate DESC
      LIMIT :LATER_LIMIT
    ]) {
      if (String.isNotBlank(later.Changed__c)) {
        addIds((List<Object>) JSON.deserializeUntyped(later.Changed__c));
      }
    }
  }

  private void addIds(List<Object> entries) {
    for (Object entry : entries) {
      Object id = entry instanceof Map<String, Object>
        ? ((Map<String, Object>) entry).get('id')
        : null;
      if (id instanceof String && String.isNotBlank((String) id)) {
        changed.add((Id) (String) id);
      }
    }
  }

  /**
   * Whether a record the import made was changed since: by a later import from another source,
   * or by anyone, as its written fields no longer match what the import wrote.
   */
  public Boolean edited(SObject record, List<String> written, String digest) {
    return changed.contains(record.Id) ||
      ImportUndoLog.digest(record, written) != digest;
  }
}
