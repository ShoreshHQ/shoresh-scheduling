/**
 * Undo, the removals: brings back from the Recycle Bin what the import removed because the new
 * file lacked it (docs/import/review.md INGEST-5.8), with what went with it. One that can no
 * longer be brought back (the Recycle Bin emptied) is named, as a record deleted since is; any
 * other refusal stops the whole Undo.
 */
public with sharing class ImportUndoRemovals {
  private ImportUndo.Result result;

  public ImportUndoRemovals(ImportUndo.Result result) {
    this.result = result;
  }

  public void run(List<Object> removals) {
    List<SObject> rows = new List<SObject>();
    List<String> names = new List<String>();
    for (Object item : removals) {
      Map<String, Object> entry = (Map<String, Object>) item;
      Object recordId = entry.get('removed');
      Schema.SObjectType kind = ImportFields.ofRecord(recordId);
      rows.add(kind.newSObject((Id) (String) recordId));
      names.add((String) entry.get('name'));
    }
    if (rows.isEmpty()) {
      return;
    }
    List<Database.UndeleteResult> outcomes = Database.undelete(
      rows,
      false,
      AccessLevel.USER_MODE
    );
    for (Integer i = 0; i < outcomes.size(); i++) {
      if (outcomes[i].isSuccess()) {
        result.restored++;
        continue;
      }
      Database.Error error = outcomes[i].getErrors()[0];
      if (
        error.getStatusCode() == StatusCode.ENTITY_IS_DELETED ||
        error.getStatusCode() == StatusCode.INVALID_ID_FIELD ||
        error.getStatusCode() == StatusCode.UNDELETE_FAILED
      ) {
        result.gone.add(names[i]);
        continue;
      }
      throw ImportUndo.refused(names[i], 'couldn\'t bring it back', error);
    }
  }
}
