/**
 * When each activity of an imported Activities list runs (ADR 0031 A7, INGEST-1.10): the boxes
 * its When it runs column takes off are added, and those it puts back removed, as a list's Weeks
 * are (INGEST-1.8). Saved with the activity they belong to and never counted on their own
 * (ImportUndoCount): an activity set up whose boxes change counts as changed. Undo removes the
 * boxes added and brings back the ones removed.
 */
public with sharing class ImportListOffTimes {
  private static final String KIND = 'ActivityOffTime';
  private ImportWriter writer;
  private ImportKeys keys;
  private Id seasonId;

  public ImportListOffTimes(ImportWriter writer, ImportKeys keys, Id seasonId) {
    this.writer = writer;
    this.keys = keys;
    this.seasonId = seasonId;
  }

  /** A list's boxes (none: null): those taken off added, then those put back (remove) removed. */
  public void save(List<ImportPlan.Entry> entries) {
    List<ImportPlan.Entry> taken = new List<ImportPlan.Entry>();
    List<ImportPlan.Entry> putBack = new List<ImportPlan.Entry>();
    for (ImportPlan.Entry entry : entries ?? new List<ImportPlan.Entry>()) {
      (entry.text('remove') == 'true' ? putBack : taken).add(entry);
    }
    add(taken);
    remove(putBack);
  }

  /** The boxes newly off, each naming its activity and time block (ImportListRows). */
  private void add(List<ImportPlan.Entry> entries) {
    if (entries.isEmpty()) {
      return;
    }
    ImportListRows build = new ImportListRows(seasonId, keys, KIND);
    List<SObject> rows = new List<SObject>();
    for (ImportPlan.Entry entry : entries) {
      // A box is only ever added or removed, and names nothing of its own kind.
      if (!entry.isNew()) {
        throw ImportListSaves.unreadable();
      }
      SObject row = build.rowFor(entry);
      if (!build.putLinks(row, entry).isEmpty()) {
        throw ImportListSaves.unreadable();
      }
      rows.add(row);
    }
    writer.saveTracked(KIND, rows);
    for (SObject row : rows) {
      writer.countOwnRows((Id) row.get(ActivityOffTime__c.Activity__c));
    }
  }

  /** The boxes back on: each one of this season's, logged so Undo brings it back. */
  private void remove(List<ImportPlan.Entry> entries) {
    Set<Id> ids = new Set<Id>();
    for (ImportPlan.Entry entry : entries) {
      Id recordId = entry.id();
      if (
        recordId == null ||
        recordId.getSObjectType() != ActivityOffTime__c.SObjectType
      ) {
        throw ImportListSaves.unreadable();
      }
      ids.add(recordId);
    }
    if (ids.isEmpty()) {
      return;
    }
    List<ActivityOffTime__c> found = [
      SELECT Id, Name, Activity__c
      FROM ActivityOffTime__c
      WHERE Id IN :ids AND Activity__r.Season__c = :seasonId
      WITH USER_MODE
    ];
    if (found.size() != ids.size()) {
      throw ImportListSaves.unreadable();
    }
    writer.logRemoved(found);
    for (ActivityOffTime__c row : found) {
      writer.countOwnRows(row.Activity__c);
    }
    Database.delete(found, AccessLevel.USER_MODE);
  }
}
