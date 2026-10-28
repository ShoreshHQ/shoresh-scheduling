/**
 * Which setup items an earlier import brought in and no one has changed since (docs/import/
 * review.md INGEST-5.7 and 5.8): an activity, fixed or recurring activity that a standing import
 * (not undone) of the season created, whose fields still hold what the last import to write them
 * wrote. Something made by hand, or changed by hand since (on any screen, Salesforce's record
 * page, a list import), is never in it: a second import updates only what is in it without
 * asking, and lists only what is in it when the new file lacks it.
 *
 * Read from the imports' own logs (ImportWriter), comparing values, not dates, as Undo does
 * (ADR 0006 §18): a value changed by hand and set back by hand to exactly what the import wrote
 * counts as the import's again.
 */
public with sharing class ImportProvenance {
  // The kinds a second import updates and lists (rules 7 and 8).
  private static final List<String> KINDS = new List<String>{
    'Activity',
    'FixedActivity',
    'RecurringActivity'
  };
  // A season's imports read, newest kept: far more than a camp makes in a year.
  private static final Integer MAX_IMPORTS = 200;

  /** One created record: its fields and fingerprint, then what later imports changed. */
  private class Written {
    String term;
    List<String> fields;
    String fingerprint;
    // Each field a later import changed: its value before the first change, and the last after.
    Map<String, Object> before = new Map<String, Object>();
    Map<String, Object> after = new Map<String, Object>();
  }

  /** The season's items an import brought in that no one has changed since, by Id. */
  public static Set<Id> untouched(Id seasonId) {
    Map<Id, Written> written = writtenBy(seasonId);
    Set<Id> result = new Set<Id>();
    for (String term : KINDS) {
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
      if (ofKind.isEmpty()) {
        continue;
      }
      Schema.SObjectType type = ImportFields.ofTerm(term);
      ImportFields.check(type, fields);
      for (
        SObject record : ImportUndoValues.read(type, fields, ofKind.keySet())
          .values()
      ) {
        if (isUntouched(record, ofKind.get(record.Id))) {
          result.add(record.Id);
        }
      }
    }
    return result;
  }

  /**
   * The record holds what the imports wrote: the fields a later import changed hold its last
   * values, and with those put back as they were before, the rest match the first fingerprint.
   */
  private static Boolean isUntouched(SObject record, Written w) {
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

  /** What the season's standing imports created, oldest first, with what later ones changed. */
  private static Map<Id, Written> writtenBy(Id seasonId) {
    Map<Id, Written> written = new Map<Id, Written>();
    for (Import__c done : [
      SELECT Created__c, Changed__c
      FROM Import__c
      WHERE Season__c = :seasonId AND UndoneAt__c = NULL
      WITH USER_MODE
      ORDER BY CreatedDate ASC, Name ASC
      LIMIT :MAX_IMPORTS
    ]) {
      if (String.isBlank(done.Created__c) || String.isBlank(done.Changed__c)) {
        continue;
      }
      readCreated(
        (Map<String, Object>) JSON.deserializeUntyped(done.Created__c),
        written
      );
      readChanged(
        (List<Object>) JSON.deserializeUntyped(done.Changed__c),
        written
      );
    }
    return written;
  }

  private static void readCreated(
    Map<String, Object> created,
    Map<Id, Written> written
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
        written.put((Id) (String) entry[0], w);
      }
    }
  }

  private static void readChanged(
    List<Object> changed,
    Map<Id, Written> written
  ) {
    for (Object item : changed) {
      if (item instanceof Map<String, Object>) {
        readChange((Map<String, Object>) item, written);
      }
    }
  }

  /** One entry of what an import changed, for a record an import created. */
  private static void readChange(
    Map<String, Object> entry,
    Map<Id, Written> written
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
  }
}
