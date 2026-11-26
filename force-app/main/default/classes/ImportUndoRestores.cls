/**
 * Undo, part two: puts back what an import changed (a program's days, a time block's times, a
 * length, a time block, a group's division), unless it was edited since. Records deleted since
 * are named; any other refusal stops the whole Undo.
 */
public with sharing class ImportUndoRestores {
  private ImportUndo.Result result;
  private Map<Id, String> names = new Map<Id, String>();

  public ImportUndoRestores(ImportUndo.Result result) {
    this.result = result;
  }

  public void run(List<ImportLogEntries.Values> changed) {
    Map<Schema.SObjectType, List<ImportLogEntries.Values>> byKind = new Map<Schema.SObjectType, List<ImportLogEntries.Values>>();
    for (ImportLogEntries.Values entry : changed) {
      Schema.SObjectType kind = entry.kind();
      ImportFields.check(kind, entry.before().keySet());
      if (!byKind.containsKey(kind)) {
        byKind.put(kind, new List<ImportLogEntries.Values>());
      }
      byKind.get(kind).add(entry);
    }
    List<SObject> rows = new List<SObject>();
    for (Schema.SObjectType kind : byKind.keySet()) {
      rows.addAll(restored(kind, byKind.get(kind)));
    }
    // DIV-1.1: a group moved out of no division goes back into a new holding record.
    NoDivisions.restoreHolders(rows);
    // Undo puts rain plans and last time blocks back as they were, even an outdoor rain plan
    // (ADR 0006 §18; ImportUndo restores as a SetupWrite RESTORE). One kind a call: Salesforce
    // refuses one save whose rows switch kind more than ten times, counted 200 rows at a time
    // (#465), and a workbook import can change a dozen kinds (INGEST-5.10).
    Map<Schema.SObjectType, List<SObject>> rowsByKind = new Map<Schema.SObjectType, List<SObject>>();
    for (SObject row : rows) {
      Schema.SObjectType kind = row.getSObjectType();
      if (!rowsByKind.containsKey(kind)) {
        rowsByKind.put(kind, new List<SObject>());
      }
      rowsByKind.get(kind).add(row);
    }
    for (List<SObject> sameKind : rowsByKind.values()) {
      putBack(sameKind);
    }
  }

  /** One kind's rows saved; any refusal (a rule, a permission) stops the whole Undo with its reason. */
  private void putBack(List<SObject> sameKind) {
    List<Database.SaveResult> outcomes = Database.update(
      sameKind,
      false,
      AccessLevel.USER_MODE
    );
    for (Integer i = 0; i < outcomes.size(); i++) {
      if (!outcomes[i].isSuccess()) {
        throw ImportUndo.refused(
          names.get(sameKind[i].Id),
          'couldn\'t put back what it was before',
          outcomes[i].getErrors()[0]
        );
      }
      result.restored++;
    }
  }

  /** One kind's records put back, read once; edited ones are kept and named. */
  private List<SObject> restored(
    Schema.SObjectType kind,
    List<ImportLogEntries.Values> entries
  ) {
    Set<Id> ids = new Set<Id>();
    Set<String> fields = new Set<String>();
    for (ImportLogEntries.Values entry : entries) {
      ids.add(entry.recordId());
      fields.addAll(entry.after().keySet());
    }
    Map<Id, SObject> now = ImportUndoValues.read(kind, fields, ids);
    List<SObject> rows = new List<SObject>();
    for (ImportLogEntries.Values entry : entries) {
      SObject current = now.get(entry.recordId());
      if (current == null) {
        // Deleted since: nothing to put back, and the summary says so.
        result.gone.add(entry.name());
        continue;
      }
      if (!ImportUndoValues.unchanged(current, entry.after())) {
        result.keptEdited.add(ImportFields.nameOf(current));
        continue;
      }
      names.put(current.Id, ImportFields.nameOf(current));
      SObject row = kind.newSObject(current.Id);
      Map<String, Object> before = entry.before();
      for (String name : before.keySet()) {
        Schema.SObjectField field = ImportFields.field(kind, name);
        row.put(field, ImportUndoValues.asField(field, before.get(name)));
      }
      rows.add(row);
    }
    return rows;
  }
}
