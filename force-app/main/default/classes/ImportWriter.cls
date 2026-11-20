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
  // What it changed, entry by entry, as Changed__c keeps it (ImportLogEntries).
  public List<Map<String, Object>> changed { get; private set; }
  // Each record's values entry, so a later write to it goes into the same one.
  private Map<Id, ImportLogEntries.Values> valuesLogged = new Map<Id, ImportLogEntries.Values>();
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
    List<ImportLogEntries.Values> before = ImportLogValues.before(rows);
    UserModeWrites.save(rows);
    logValues(ImportLogValues.withAfter(before, rows));
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
    List<ImportLogEntries.Values> before = ImportLogValues.before(existing);
    UserModeWrites.save(rows);
    mergeChanges(ImportLogValues.withAfter(before, existing));
    for (SObject row : rows) {
      if (createdRows.containsKey(row.Id)) {
        SObject written = createdRows.get(row.Id);
        for (
          Schema.SObjectField field : ImportLogValues.written(row).values()
        ) {
          written.put(field, row.get(field));
        }
        List<String> fields = ImportLogValues.fieldsOf(written);
        List<Object> entry = createdEntries.get(row.Id);
        entry[1] = fieldsetOf(createdTerms.get(row.Id), fields);
        entry[2] = ImportUndoValues.digest(written, fields);
      }
    }
  }

  /**
   * Changes to records already logged as changed go into their first entry (what it was before
   * the import stays the first "before"), so Undo puts each record back in one update.
   */
  private void mergeChanges(List<ImportLogEntries.Values> entries) {
    for (ImportLogEntries.Values entry : entries) {
      Id recordId = entry.recordId();
      ImportLogEntries.Values first = valuesLogged.get(recordId);
      if (first == null) {
        logValues(new List<ImportLogEntries.Values>{ entry });
        countChange(ImportFields.termOf(recordId.getSObjectType()), recordId);
      } else {
        first.addLater(entry);
      }
    }
  }

  private void logValues(List<ImportLogEntries.Values> entries) {
    for (ImportLogEntries.Values entry : entries) {
      changed.add(entry.toLog());
      valuesLogged.put(entry.recordId(), entry);
    }
  }

  /**
   * Records a camp workbook adds or changes beside its lists (camp words, part D): the added
   * kept for Undo to remove, the changed with their values before.
   */
  public void writeTracked(
    String term,
    List<SObject> added,
    List<SObject> existing
  ) {
    List<ImportLogEntries.Values> before = ImportLogValues.before(existing);
    if (!existing.isEmpty()) {
      UserModeWrites.save(existing);
    }
    logValues(ImportLogValues.withAfter(before, existing));
    for (SObject row : existing) {
      countChange(term, row.Id);
    }
    if (!added.isEmpty()) {
      saveTracked(term, added);
    }
    for (Integer i = 0; i < added.size(); i++) {
      result.countAdded(term);
    }
  }

  /** A camp word a workbook set back to Shoresh's own (removed): logged for Undo to put back. */
  public void logWordOff(CampLabel__c label) {
    changed.add(new ImportLogEntries.WordOff(label).toLog());
    countChange('CampLabel', label.Id);
  }

  /** A week an item was off that a workbook ticked back on (removed): logged for Undo. */
  public void logWeekBackOn(ImportLogEntries.WeekOn entry, Id target) {
    changed.add(entry.toLog());
    countChange(ImportFields.termOf(target.getSObjectType()), target);
  }

  /**
   * Records an earlier import brought in that this one removes (INGEST-5.8): logged for Undo to
   * bring back from the Recycle Bin, and counted.
   */
  public void logRemoved(List<SObject> records) {
    for (SObject record : records) {
      changed.add(new ImportLogEntries.Removed(record).toLog());
      result.countRemoved(ImportFields.termOf(record.getSObjectType()));
    }
  }

  /** Every record this import created so far. */
  public Set<Id> createdIds() {
    return new Set<Id>(createdRows.keySet());
  }

  /**
   * An earlier imported week's day this import took a removed item's cells out of (INGEST-5.8):
   * its grid before and after, for Undo to put back exactly.
   */
  public void logCellsOut(ScheduleDay__c day, String after) {
    changed.add(new ImportLogEntries.CellsOut(day, after).toLog());
  }

  /** A who list an import replaced (slice 4c): logged for Undo to put back. */
  public void logWho(ImportLogEntries.Who change) {
    Id ownerId = change.ownerId();
    countChange(ImportFields.termOf(ownerId.getSObjectType()), ownerId);
    changed.add(change.toLog());
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
    List<String> fields = ImportLogValues.fieldsOf(row);
    List<Object> entry = new List<Object>{
      row.Id,
      fieldsetOf(term, fields),
      ImportUndoValues.digest(row, fields)
    };
    ((List<Object>) created.get(term).get('rows')).add(entry);
    createdRows.put(row.Id, row);
    createdEntries.put(row.Id, entry);
    createdTerms.put(row.Id, term);
  }
}
