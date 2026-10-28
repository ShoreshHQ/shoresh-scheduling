/**
 * Which setup items an earlier import brought in and no one has changed since (docs/import/
 * review.md INGEST-5.7 and 5.8): an activity, fixed or recurring activity that a standing import
 * (not undone) of the season created, that
 *  - still holds what the last import to write it wrote (compared by value, as Undo compares),
 *  - has not been saved since that import (LastModifiedDate no later than the import's record, so
 *    a value changed by hand and set back by hand still counts as changed), and
 *  - has no attached record (who can do it, who it covers, weeks off) added, changed or deleted
 *    since: each one is one an import made, not saved since.
 * Anything else (made by hand, or changed by hand since, on any screen) is never in it: a
 * second import updates only what is in it without asking, and lists only what is in it when the
 * new file lacks it.
 */
public with sharing class ImportProvenance {
  // The kinds a second import updates and lists (rules 7 and 8).
  private static final List<String> KINDS = new List<String>{
    'Activity',
    'FixedActivity',
    'RecurringActivity'
  };
  // The season's newest imports read: far more than a camp makes in a year. Items only older
  // imports made are not counted as the import's (asked, never changed unasked).
  @TestVisible
  private static Integer maxImports = 200;

  /** What the screen needs: the untouched items, and why any of them is still in use. */
  public class Standing {
    @AuraEnabled
    public List<Id> untouched { get; set; }
    @AuraEnabled
    public Map<Id, String> inUse { get; set; }
    /** Cells only in imports' own versions, by item: uses unless this import supersedes them. */
    @AuraEnabled
    public Map<Id, List<ImportItemUses.VersionUse>> versionUses { get; set; }
  }

  /** One created record: its fields and fingerprint, then what later imports changed. */
  private class Written {
    String term;
    List<String> fields;
    String fingerprint;
    // When the last import to write it was saved.
    Datetime writtenAt;
    // Each field a later import changed: its value before the first change, and the last after.
    Map<String, Object> before = new Map<String, Object>();
    Map<String, Object> after = new Map<String, Object>();
  }

  /** The untouched items, with what uses them (ImportItemUses). */
  public static Standing standing(Id seasonId) {
    Map<Id, String> names = new Map<Id, String>();
    Set<Id> ids = untouchedNamed(seasonId, names);
    Standing result = new Standing();
    result.untouched = new List<Id>(ids);
    result.versionUses = new Map<Id, List<ImportItemUses.VersionUse>>();
    result.inUse = ImportItemUses.reasons(seasonId, names, result.versionUses);
    return result;
  }

  /** The season's items an import brought in that no one has changed since, by Id. */
  public static Set<Id> untouched(Id seasonId) {
    return untouchedNamed(seasonId, new Map<Id, String>());
  }

  private static Set<Id> untouchedNamed(Id seasonId, Map<Id, String> names) {
    Map<Id, Datetime> attached = new Map<Id, Datetime>();
    Map<Id, Written> written = writtenBy(seasonId, attached);
    Set<Id> result = new Set<Id>();
    for (String term : KINDS) {
      result.addAll(untouchedOfKind(term, written, names));
    }
    result.removeAll(ImportProvenanceAttached.changed(result, attached));
    for (Id gone : new Set<Id>(names.keySet())) {
      if (!result.contains(gone)) {
        names.remove(gone);
      }
    }
    return result;
  }

  /** One kind's created records that still hold what the imports wrote, named. */
  private static Set<Id> untouchedOfKind(
    String term,
    Map<Id, Written> written,
    Map<Id, String> names
  ) {
    Map<Id, Written> ofKind = new Map<Id, Written>();
    Set<String> fields = new Set<String>();
    for (Id recordId : written.keySet()) {
      Written w = written.get(recordId);
      if (w.term == term) {
        ofKind.put(recordId, w);
        fields.addAll(w.fields);
        fields.addAll(w.after.keySet());
      }
    }
    Set<Id> result = new Set<Id>();
    if (ofKind.isEmpty()) {
      return result;
    }
    for (
      SObject record : ImportUndoValues.readSaved(
        ImportFields.ofTerm(term),
        fields,
        ofKind.keySet()
      )
    ) {
      if (isUntouched(record, ofKind.get(record.Id))) {
        result.add(record.Id);
        names.put(record.Id, (String) record.get('Name'));
      }
    }
    return result;
  }

  /**
   * The record holds what the imports wrote and was not saved after the last of them: the fields a
   * later import changed hold its last values, and with those put back as they were before, the
   * rest match the first fingerprint.
   */
  private static Boolean isUntouched(SObject record, Written w) {
    if (((Datetime) record.get('LastModifiedDate')) > w.writtenAt) {
      return false;
    }
    if (!ImportUndoValues.unchanged(record, w.after)) {
      return false;
    }
    SObject asCreated = record.clone(true, false);
    Schema.SObjectType type = record.getSObjectType();
    for (String name : w.before.keySet()) {
      Schema.SObjectField field = ImportFields.field(type, name);
      asCreated.put(field, ImportUndoValues.asField(field, w.before.get(name)));
    }
    return ImportUndoLog.digest(asCreated, w.fields) == w.fingerprint;
  }

  /**
   * What the season's newest standing imports created, oldest first, with what later ones changed.
   * attached: the attached records they made, with when each import was saved.
   */
  private static Map<Id, Written> writtenBy(
    Id seasonId,
    Map<Id, Datetime> attached
  ) {
    List<Import__c> newestFirst = [
      SELECT Created__c, Changed__c, CreatedDate
      FROM Import__c
      WHERE Season__c = :seasonId AND UndoneAt__c = NULL
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Name DESC
      LIMIT :maxImports
    ];
    Map<Id, Written> written = new Map<Id, Written>();
    for (Integer i = newestFirst.size() - 1; i >= 0; i--) {
      Import__c done = newestFirst[i];
      if (String.isBlank(done.Created__c) || String.isBlank(done.Changed__c)) {
        continue;
      }
      Map<String, Object> created = (Map<String, Object>) JSON.deserializeUntyped(
        done.Created__c
      );
      readCreated(created, written, done.CreatedDate);
      ImportProvenanceAttached.read(created, attached, done.CreatedDate);
      readChanged(
        (List<Object>) JSON.deserializeUntyped(done.Changed__c),
        written,
        done.CreatedDate
      );
    }
    return written;
  }

  private static void readCreated(
    Map<String, Object> created,
    Map<Id, Written> written,
    Datetime at
  ) {
    for (String term : KINDS) {
      if (!created.containsKey(term)) {
        continue;
      }
      Map<String, Object> kind = (Map<String, Object>) created.get(term);
      List<Object> fieldsets = (List<Object>) kind.get('fieldsets');
      Schema.SObjectType type = ImportFields.ofTerm(term);
      for (Object row : (List<Object>) kind.get('rows')) {
        List<Object> entry = (List<Object>) row;
        if (ImportFields.ofRecord(entry[0]) != type) {
          throw ImportFields.unreadableLog();
        }
        Written w = new Written();
        w.term = term;
        w.fields = new List<String>();
        for (Object name : (List<Object>) fieldsets[(Integer) entry[1]]) {
          w.fields.add((String) name);
        }
        w.fingerprint = (String) entry[2];
        w.writtenAt = at;
        written.put((Id) (String) entry[0], w);
      }
    }
  }

  private static void readChanged(
    List<Object> changed,
    Map<Id, Written> written,
    Datetime at
  ) {
    for (Object item : changed) {
      if (item instanceof Map<String, Object>) {
        readChange((Map<String, Object>) item, written, at);
      }
    }
  }

  /** One entry of what an import changed, for a record an import created. */
  private static void readChange(
    Map<String, Object> entry,
    Map<Id, Written> written,
    Datetime at
  ) {
    // Removed by a later import (rule 8): no longer there to update or list.
    if (entry.containsKey('removed')) {
      written.remove((Id) (String) entry.get('removed'));
      return;
    }
    Object recordId = entry.get('id');
    Written w = recordId instanceof String
      ? written.get((Id) (String) recordId)
      : null;
    Map<String, Object> before = (Map<String, Object>) entry.get('before');
    Map<String, Object> after = (Map<String, Object>) entry.get('after');
    if (w == null || before == null || after == null) {
      return;
    }
    for (String name : before.keySet()) {
      if (!w.before.containsKey(name)) {
        w.before.put(name, before.get(name));
      }
    }
    w.after.putAll(after);
    w.writtenAt = at;
  }
}
