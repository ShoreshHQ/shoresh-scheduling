/**
 * Writes an import's records one kind at a time, in user mode, all or none: records each new
 * record's key for what comes after, counts what was added and changed, and keeps, for Undo
 * last import, the values it wrote (to tell later whether someone edited them) and, for changed
 * records, the values before.
 */
public with sharing class ImportWriter {
  public ImportKeys keys { get; private set; }
  public ImportSetupSaves.Result result { get; private set; }
  // Created records by kind: [{ id, fields: values written }].
  public Map<String, List<Map<String, Object>>> created { get; private set; }
  // Changed records: [{ id, type, before, after }].
  public List<Map<String, Object>> changed { get; private set; }

  public ImportWriter(ImportKeys keys) {
    this.keys = keys;
    this.result = new ImportSetupSaves.Result();
    this.created = new Map<String, List<Map<String, Object>>>();
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
      created.put(term, new List<Map<String, Object>>());
    }
    created
      .get(term)
      .add(
        new Map<String, Object>{
          'id' => row.Id,
          'fields' => ImportUndoLog.values(row)
        }
      );
  }
}
