/**
 * What an earlier import brought in and the new file no longer has, removed where the director
 * chose Remove (docs/import/review.md INGEST-5.8). Only items an import brought in and no one
 * has changed since (ImportProvenance) can be removed: anything else named is refused, and the
 * whole import with it. Removed in user mode; Undo of this import brings them back
 * (ImportUndoRemovals).
 */
public with sharing class ImportRemovals {
  private ImportPlan plan;
  private ImportWriter writer;

  public ImportRemovals(ImportPlan plan, ImportWriter writer) {
    this.plan = plan;
    this.writer = writer;
  }

  public void run() {
    List<ImportPlan.Entry> entries = plan.entries('removals');
    if (entries.isEmpty()) {
      return;
    }
    List<SObject> records = checked(entries);
    writer.logRemoved(records);
    List<Database.DeleteResult> outcomes = Database.delete(
      records,
      false,
      AccessLevel.USER_MODE
    );
    for (Integer i = 0; i < outcomes.size(); i++) {
      if (!outcomes[i].isSuccess()) {
        throw new ShoreshException(
          records[i].get('Name') +
            ' could not be removed, so nothing was saved. ' +
            ScreenErrors.messageOf(outcomes[i].getErrors()[0])
        );
      }
    }
  }

  /**
   * The records to remove, each still the import's (ImportProvenance), named as the screen
   * named it (for the log and Undo's message only); anything else refuses the whole import.
   */
  private List<SObject> checked(List<ImportPlan.Entry> entries) {
    Set<Id> allowed = ImportProvenance.untouched(plan.seasonId);
    List<SObject> records = new List<SObject>();
    for (ImportPlan.Entry entry : entries) {
      Id recordId = entry.id();
      String name = entry.has('name') ? entry.text('name') : 'An item';
      if (recordId == null || !allowed.contains(recordId)) {
        throw new ShoreshException(
          name +
          ' was made or changed by hand, so this import does not remove it. Nothing was saved.'
        );
      }
      SObject record = recordId.getSObjectType().newSObject(recordId);
      record.put('Name', name);
      records.add(record);
    }
    return records;
  }
}
