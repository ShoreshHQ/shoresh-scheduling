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

  public void run(List<Object> changed) {
    Map<Schema.SObjectType, List<Map<String, Object>>> byKind = new Map<Schema.SObjectType, List<Map<String, Object>>>();
    for (Object item : changed) {
      Map<String, Object> entry = (Map<String, Object>) item;
      Schema.SObjectType kind = ImportFields.ofRecord(entry.get('id'));
      ImportFields.check(
        kind,
        ((Map<String, Object>) entry.get('before')).keySet()
      );
      if (!byKind.containsKey(kind)) {
        byKind.put(kind, new List<Map<String, Object>>());
      }
      byKind.get(kind).add(entry);
    }
    List<SObject> rows = new List<SObject>();
    for (Schema.SObjectType kind : byKind.keySet()) {
      rows.addAll(restored(kind, byKind.get(kind)));
    }
    // DIV-1.1: a group moved out of no division goes back into a new holding record.
    NoDivisions.restoreHolders(rows);
    // Undo puts rain plans back as they were, even one made outdoors since (ADR 0006 §18).
    ActivityTriggerHandler.checkRainPlans = false;
    List<Database.SaveResult> outcomes;
    try {
      outcomes = Database.update(rows, false, AccessLevel.USER_MODE);
    } finally {
      ActivityTriggerHandler.checkRainPlans = true;
    }
    for (Integer i = 0; i < outcomes.size(); i++) {
      if (!outcomes[i].isSuccess()) {
        // Any refusal (a rule, a permission) stops the whole Undo with its reason.
        throw ImportUndo.refused(
          names.get(rows[i].Id),
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
    List<Map<String, Object>> entries
  ) {
    Set<Id> ids = new Set<Id>();
    Set<String> fields = new Set<String>();
    for (Map<String, Object> entry : entries) {
      ids.add((Id) (String) entry.get('id'));
      fields.addAll(((Map<String, Object>) entry.get('after')).keySet());
    }
    Map<Id, SObject> now = ImportUndoValues.read(kind, fields, ids);
    List<SObject> rows = new List<SObject>();
    for (Map<String, Object> entry : entries) {
      SObject current = now.get((Id) (String) entry.get('id'));
      if (current == null) {
        // Deleted since: nothing to put back, and the summary says so.
        result.gone.add((String) entry.get('name'));
        continue;
      }
      if (
        !ImportUndoValues.unchanged(
          current,
          (Map<String, Object>) entry.get('after')
        )
      ) {
        result.keptEdited.add(ImportFields.nameOf(current));
        continue;
      }
      names.put(current.Id, ImportFields.nameOf(current));
      SObject row = kind.newSObject(current.Id);
      Map<String, Object> before = (Map<String, Object>) entry.get('before');
      for (String name : before.keySet()) {
        Schema.SObjectField field = ImportFields.field(kind, name);
        row.put(field, ImportUndoValues.asField(field, before.get(name)));
      }
      rows.add(row);
    }
    return rows;
  }
}
