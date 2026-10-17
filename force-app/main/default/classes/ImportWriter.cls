/**
 * Writes an import's records one kind at a time, in user mode, all or none: records each new
 * record's key for what comes after, and counts what was added and changed.
 */
public with sharing class ImportWriter {
  public ImportKeys keys { get; private set; }
  public ImportSetupSaves.Result result { get; private set; }

  public ImportWriter(ImportKeys keys) {
    this.keys = keys;
    this.result = new ImportSetupSaves.Result();
  }

  /** Saves one kind's rows (entries and rows in the same order). */
  public void write(
    String term,
    List<ImportPlan.Entry> entries,
    List<SObject> rows
  ) {
    UserModeWrites.save(rows);
    for (Integer i = 0; i < entries.size(); i++) {
      if (entries[i].isNew()) {
        keys.put(entries[i].key(), rows[i].Id);
        result.countAdded(term);
      } else {
        result.countChanged(term);
      }
    }
  }
}
