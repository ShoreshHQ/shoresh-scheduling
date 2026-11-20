/**
 * The import log, kept on each import's record (Import__c) and read back by Undo last import,
 * which restores the camp as it was (docs/import/review.md INGEST-5.10). ImportWriter records
 * it as an import (or Copy season) saves; reverse() puts it back, its steps run only from here.
 *
 * Created__c: what the import made, by kind (ImportWriter.created), each with a fingerprint of
 * what it wrote. Changed__c: what it changed, entry by entry (ImportLogEntries).
 *
 * What triggers do as an import saves needs no entry of its own. Values a trigger works out from
 * the row (keys, a time block's name that follows its times, a fixed or recurring activity's
 * last block) are worked out again when Undo puts the row back; a holding record of a group with
 * no division that went when its last group moved out is made again (NoDivisions.restoreHolders);
 * records that go with one deleted go with it. The rest of what triggers do only checks.
 */
public with sharing class ImportUndoLog {
  /**
   * Puts back what the import did, in this order: what it removed comes back, then what it
   * changed goes back (a group moved into a division the import made goes home), then what it
   * made is removed. Anything edited since, or still in use, is kept and named in the result.
   */
  public static void reverse(Import__c done, ImportUndo.Result result) {
    ImportLogEntries.Changes changes = ImportLogEntries.read(done.Changed__c);
    // Anything that isn't an entry is the refusal.
    if (changes.unreadable) {
      throw ImportFields.unreadableLog();
    }
    Id campId = touchesCampWords(done, changes) ? campOf(done.Season__c) : null;
    if (campId != null) {
      // Camp words are shared by the camp's seasons: another season's import waits.
      ImportUndo.lockCamp(campId);
    }
    new ImportUndoRemovals(result).run(changes.removals);
    ImportSupersededCells.putBack(changes.cellsTakenOut, result);
    new ImportUndoRestores(result).run(changes.recordValues);
    new ImportUndoWho(result).run(changes.whoLists);
    new ImportUndoWeeksOff(result, done.Season__c).run(changes.weeksOn);
    new ImportUndoWords(result, campId).run(changes.wordsOff);
    // Last, what it made, its imported week too, which nothing else may delete.
    ImportedWeekGuard.allow();
    try {
      new ImportUndoDeletes(result, new ImportUndoLater(done), done.Season__c)
        .run((Map<String, Object>) JSON.deserializeUntyped(done.Created__c));
    } finally {
      ImportedWeekGuard.done();
    }
  }

  /** Whether Undo changes camp words: one the import added, changed, or set back. */
  private static Boolean touchesCampWords(
    Import__c done,
    ImportLogEntries.Changes changes
  ) {
    if (
      !changes.wordsOff.isEmpty() ||
      ((Map<String, Object>) JSON.deserializeUntyped(done.Created__c))
        .containsKey('CampLabel')
    ) {
      return true;
    }
    for (ImportLogEntries.Values entry : changes.recordValues) {
      if (entry.kind() == CampLabel__c.SObjectType) {
        return true;
      }
    }
    return false;
  }

  private static Id campOf(Id seasonId) {
    return [SELECT Camp__c FROM Season__c WHERE Id = :seasonId WITH USER_MODE]
    .Camp__c;
  }
}
