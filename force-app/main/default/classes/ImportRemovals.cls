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
  // Days of superseded imported weeks holding a removed item's cells (INGEST-5.8).
  private Set<Id> daysToClear = new Set<Id>();

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
    ImportSupersededCells.takeOut(
      daysToClear,
      new Map<Id, SObject>(records).keySet(),
      writer
    );
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
   * The records to remove, each still the import's (ImportProvenance) and used by nothing else
   * (ImportItemUses), named as the screen named it (for the log and Undo's message only);
   * anything else refuses the whole import with its reason.
   */
  private List<SObject> checked(List<ImportPlan.Entry> entries) {
    Set<Id> allowed = ImportProvenance.untouched(plan.seasonId);
    Map<Id, String> names = new Map<Id, String>();
    List<SObject> records = new List<SObject>();
    for (ImportPlan.Entry entry : entries) {
      Id recordId = entry.id();
      String name = nameOf(entry);
      if (recordId == null || !allowed.contains(recordId)) {
        throw new ShoreshException(
          name +
          ' was made or changed by hand, so this import does not remove it. Nothing was saved.'
        );
      }
      names.put(recordId, name);
      SObject record = recordId.getSObjectType().newSObject(recordId);
      record.put('Name', name);
      records.add(record);
    }
    refuseInUse(names);
    return records;
  }

  /**
   * In use since the files were read: refused with the reason, so nothing pointing at it is ever
   * cleared (INGEST-5.8).
   */
  private void refuseInUse(Map<Id, String> names) {
    Map<Id, List<ImportItemUses.VersionUse>> versionUses = new Map<Id, List<ImportItemUses.VersionUse>>();
    Map<Id, String> inUse = ImportItemUses.reasons(
      plan.seasonId,
      names,
      versionUses
    );
    // Cells in an imported week this import supersedes go with it; any other is a use.
    Set<Id> superseded = ImportSupersededCells.superseded(plan, writer);
    for (Id item : versionUses.keySet()) {
      for (ImportItemUses.VersionUse use : versionUses.get(item)) {
        if (superseded.contains(use.scheduleId)) {
          daysToClear.add(use.dayId);
        } else if (!inUse.containsKey(item)) {
          inUse.put(item, names.get(item) + ' is on ' + use.name);
        }
      }
    }
    if (!inUse.isEmpty()) {
      throw new ShoreshException(
        inUse.values()[0] + ', so it can\'t be removed. Nothing was saved.'
      );
    }
  }

  private static String nameOf(ImportPlan.Entry entry) {
    return entry.has('name') ? entry.text('name') : 'An item';
  }
}
