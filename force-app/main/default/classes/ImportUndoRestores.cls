/**
 * Undo, part two: puts back what an import changed (a program's days, a time block's times, a
 * length, a time block, a group's division), unless it was edited since.
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
      Schema.SObjectType kind = ((Id) (String) entry.get('id'))
        .getSObjectType();
      if (!byKind.containsKey(kind)) {
        byKind.put(kind, new List<Map<String, Object>>());
      }
      byKind.get(kind).add(entry);
    }
    List<SObject> rows = new List<SObject>();
    for (Schema.SObjectType kind : byKind.keySet()) {
      rows.addAll(restored(kind, byKind.get(kind)));
    }
    List<Database.SaveResult> outcomes = Database.update(
      rows,
      false,
      AccessLevel.USER_MODE
    );
    for (Integer i = 0; i < outcomes.size(); i++) {
      if (outcomes[i].isSuccess()) {
        result.restored++;
      } else {
        result.keptInUse.add(names.get(rows[i].Id));
      }
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
    Map<Id, SObject> now = ImportUndoValues.read(
      kind.getDescribe().getName(),
      fields,
      ids
    );
    List<SObject> rows = new List<SObject>();
    for (Map<String, Object> entry : entries) {
      SObject current = now.get((Id) (String) entry.get('id'));
      if (current == null) {
        continue;
      }
      if (
        !ImportUndoValues.unchanged(
          current,
          (Map<String, Object>) entry.get('after')
        )
      ) {
        result.keptEdited.add((String) current.get('Name'));
        continue;
      }
      names.put(current.Id, (String) current.get('Name'));
      SObject row = kind.newSObject(current.Id);
      Map<String, Object> before = (Map<String, Object>) entry.get('before');
      for (String field : before.keySet()) {
        row.put(
          field,
          ImportUndoValues.asField(kind, field, before.get(field))
        );
      }
      rows.add(row);
    }
    return rows;
  }
}
