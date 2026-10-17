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
  // Changed records: [{ id, type, before, after }].
  public List<Map<String, Object>> changed { get; private set; }

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
        result.countChanged(term);
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
    Map<String, Object> kind = created.get(term);
    List<Object> fieldsets = (List<Object>) kind.get('fieldsets');
    List<String> fields = ImportUndoLog.fieldsOf(row);
    Integer fieldset = fieldsets.indexOf(fields);
    if (fieldset < 0) {
      fieldsets.add(fields);
      fieldset = fieldsets.size() - 1;
    }
    ((List<Object>) kind.get('rows'))
      .add(
        new List<Object>{ row.Id, fieldset, ImportUndoLog.digest(row, fields) }
      );
  }
}
