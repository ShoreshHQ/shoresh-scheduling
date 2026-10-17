/**
 * Writes an import's records one kind at a time, in user mode, all or none: records each new
 * record's key for what comes after, counts what was added and changed, and keeps, for Undo
 * last import, the values it wrote (to tell later whether someone edited them) and, for changed
 * records, the values before.
 */
public with sharing class ImportWriter {
  public ImportKeys keys { get; private set; }
  public ImportSetupSaves.Result result { get; private set; }
  // Created records by kind: { fieldsets: [[field, ...]], rows: [[id, fieldset, fingerprint]] }:
  // the values written, as a fingerprint, so Undo can tell whether anyone edited them since.
  public Map<String, Map<String, Object>> created { get; private set; }
  // Changed records: [{ id, type, before, after }]; who lists replaced (slice 4c):
  // [{ who: owner id, type, name, before: [target ids], after: [target ids] }].
  public List<Map<String, Object>> changed { get; private set; }
  // Each created record as written, and its entry in created, so a later step can amend it.
  private Map<Id, SObject> createdRows = new Map<Id, SObject>();
  private Map<Id, List<Object>> createdEntries = new Map<Id, List<Object>>();
  private Map<Id, String> createdTerms = new Map<Id, String>();
  // Existing records counted as changed, so a later step (a link, a who list) counts each once.
  private Set<Id> countedChanged = new Set<Id>();

  public ImportWriter(ImportKeys keys) {
    this.keys = keys;
    this.result = new ImportSetupSaves.Result();
    this.created = new Map<String, Map<String, Object>>();
    this.changed = new List<Map<String, Object>>();
  }

  /** Saves one kind's rows (entries and rows in the same order). */
  public void write(
    String term,
    List<ImportPlan.Entry> entries,
    List<SObject> rows
  ) {
    List<Map<String, Object>> before = ImportUndoLog.before(rows);
    UserModeWrites.save(rows);
    changed.addAll(ImportUndoLog.withAfter(before, rows));
    for (Integer i = 0; i < entries.size(); i++) {
      if (entries[i].isNew()) {
        keys.put(entries[i].key(), rows[i].Id);
        result.countAdded(term);
        track(term, rows[i]);
      } else {
        countChange(term, rows[i].Id);
      }
    }
  }

  /** Rows saved without a count of their own (who rows, versions): kept for Undo. */
  public void saveTracked(String term, List<SObject> rows) {
    UserModeWrites.save(rows);
    for (SObject row : rows) {
      track(term, row);
    }
  }

  /**
   * A second write to records this import just saved (slice 4c: a rain plan naming an activity
   * added in the same list). Created records are fingerprinted again with the new values;
   * existing ones are logged for Undo like any change.
   */
  public void amend(List<SObject> rows) {
    List<SObject> existing = new List<SObject>();
    for (SObject row : rows) {
      if (!createdRows.containsKey(row.Id)) {
        existing.add(row);
      }
    }
    List<Map<String, Object>> before = ImportUndoLog.before(existing);
    UserModeWrites.save(rows);
    mergeChanges(ImportUndoLog.withAfter(before, existing));
    for (SObject row : rows) {
      if (createdRows.containsKey(row.Id)) {
        SObject written = createdRows.get(row.Id);
        for (String field : row.getPopulatedFieldsAsMap().keySet()) {
          written.put(field, row.get(field));
        }
        List<String> fields = ImportUndoLog.fieldsOf(written);
        List<Object> entry = createdEntries.get(row.Id);
        entry[1] = fieldsetOf(createdTerms.get(row.Id), fields);
        entry[2] = ImportUndoLog.digest(written, fields);
      }
    }
  }

  /**
   * Changes to records already logged as changed go into their first entry (what it was before
   * the import stays the first "before"), so Undo puts each record back in one update.
   */
  private void mergeChanges(List<Map<String, Object>> entries) {
    Map<Object, Map<String, Object>> logged = new Map<Object, Map<String, Object>>();
    for (Map<String, Object> entry : changed) {
      if (entry.containsKey('id')) {
        logged.put(entry.get('id'), entry);
      }
    }
    for (Map<String, Object> entry : entries) {
      Map<String, Object> first = logged.get(entry.get('id'));
      if (first == null) {
        changed.add(entry);
        Id recordId = (Id) entry.get('id');
        countChange(
          recordId.getSObjectType().getDescribe().getName().removeEnd('__c'),
          recordId
        );
        continue;
      }
      Map<String, Object> before = (Map<String, Object>) first.get('before');
      Map<String, Object> laterBefore = (Map<String, Object>) entry.get(
        'before'
      );
      for (String field : laterBefore.keySet()) {
        if (!before.containsKey(field)) {
          before.put(field, laterBefore.get(field));
        }
      }
      ((Map<String, Object>) first.get('after'))
        .putAll((Map<String, Object>) entry.get('after'));
    }
  }

  /** A who list replaced on an existing item: what it was, and what the import wrote. */
  public void logWho(
    SObject owner,
    String type,
    List<String> before,
    List<String> after
  ) {
    countChange(
      owner.getSObjectType().getDescribe().getName().removeEnd('__c'),
      owner.Id
    );
    changed.add(
      new Map<String, Object>{
        'who' => owner.Id,
        'type' => type,
        'name' => owner.get('Name'),
        'before' => before,
        'after' => after
      }
    );
  }

  private void countChange(String term, Id recordId) {
    if (countedChanged.add(recordId)) {
      result.countChanged(term);
    }
  }

  private Integer fieldsetOf(String term, List<String> fields) {
    List<Object> fieldsets = (List<Object>) created.get(term).get('fieldsets');
    Integer fieldset = fieldsets.indexOf(fields);
    if (fieldset < 0) {
      fieldsets.add(fields);
      fieldset = fieldsets.size() - 1;
    }
    return fieldset;
  }

  private void track(String term, SObject row) {
    if (!created.containsKey(term)) {
      created.put(
        term,
        new Map<String, Object>{
          'fieldsets' => new List<Object>(),
          'rows' => new List<Object>()
        }
      );
    }
    List<String> fields = ImportUndoLog.fieldsOf(row);
    List<Object> entry = new List<Object>{
      row.Id,
      fieldsetOf(term, fields),
      ImportUndoLog.digest(row, fields)
    };
    ((List<Object>) created.get(term).get('rows')).add(entry);
    createdRows.put(row.Id, row);
    createdEntries.put(row.Id, entry);
    createdTerms.put(row.Id, term);
  }
}
