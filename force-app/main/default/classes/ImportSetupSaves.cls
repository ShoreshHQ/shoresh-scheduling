/**
 * Saves the setup an import proposes (slice 4b); questions the director left open are kept, and
 * nothing that depends on them is saved (docs/import/review.md INGEST-5.5):
 * everything is added (and the few changes the director chose are made) all or none, in user
 * mode, and fixed and recurring activities are checked for clashes once everything is written,
 * as a screen save is. Nothing is overwritten that the director did not choose to change.
 */
public with sharing class ImportSetupSaves {
  /** How many of each thing were added and changed, by model term ("Group" -> 6). */
  public class Result {
    @AuraEnabled
    public Map<String, Integer> added { get; set; }
    @AuraEnabled
    public Map<String, Integer> changed { get; set; }
    /** What an earlier import brought in that the director chose to remove (INGEST-5.8). */
    @AuraEnabled
    public Map<String, Integer> removed { get; set; }
    /** Updates left out: changed by hand since the files were read (INGEST-5.7). */
    @AuraEnabled
    public List<String> leftAsIs { get; set; }
    /** Open questions that did not fit with the import: asked next time (INGEST-5.5). */
    @AuraEnabled
    public Integer openNotKept { get; set; }
    /** The import's record, for Undo last import. */
    @AuraEnabled
    public Id importId { get; set; }

    public Result() {
      added = new Map<String, Integer>();
      changed = new Map<String, Integer>();
      removed = new Map<String, Integer>();
      leftAsIs = new List<String>();
      openNotKept = 0;
    }

    public void countRemoved(String term) {
      removed.put(
        term,
        (removed.containsKey(term) ? removed.get(term) : 0) + 1
      );
    }

    public void countAdded(String term) {
      added.put(term, (added.containsKey(term) ? added.get(term) : 0) + 1);
    }

    public void countChanged(String term) {
      changed.put(
        term,
        (changed.containsKey(term) ? changed.get(term) : 0) + 1
      );
    }
  }

  public static Result save(String planText) {
    ImportPlan plan = new ImportPlan(planText);
    // Locked: imports and Undos in one season take turns (ImportUndo.lockSeason).
    List<Season__c> seasons = [
      SELECT Id, Camp__c
      FROM Season__c
      WHERE Id = :plan.seasonId
      WITH USER_MODE
      FOR UPDATE
    ];
    if (seasons.isEmpty()) {
      throw new ShoreshException(
        'That ' +
          CampLabels.modelTermsOnly().singularInSentence('Season') +
          ' was not found, or you do not have access to it.'
      );
    }
    ImportKeys keys = new ImportKeys(
      plan.seasonId,
      CampLabels.forCamp(seasons[0].Camp__c)
    );
    ImportWriter writer = new ImportWriter(keys);
    // INGEST-5.7: an update made without asking is applied only to what is still the import's.
    if (plan.hasAutoChanges()) {
      writer.result.leftAsIs = plan.dropAutoChanges(
        ImportProvenance.untouched(plan.seasonId)
      );
    }
    SetTimeGuard.defer();
    Savepoint beforeSave = Database.setSavepoint();
    try {
      // A season with no weeks gets them from its dates first, so last year's week has one to go
      // to (Greg: an import adds what's missing; coordinator, 2026-10-17).
      new ImportWorkbookExtras(writer, plan.seasonId, seasons[0].Camp__c)
        .fillWeeks(plan.entries('fillWeeks'));
      new ImportStructureWrites(plan, writer).run();
      new ImportItemWrites(plan, writer).run();
      // Electives read in the file (slice E9): after the activities, before the versions.
      new ImportElectiveWrites(plan, writer).run();
      new ImportVersionWrites(plan, writer).run();
      // A week's day with its own time blocks, as a special day on that day (INGEST-4.3).
      new ImportSpecialDayWrites(plan, writer).run();
      // What an earlier import brought in that the new file lacks, removed as chosen (INGEST-5.8).
      new ImportRemovals(plan, writer).run();
      SetTimeGuard.checkPending();
      ImportAnswers.save(seasons[0].Camp__c, plan);
      // What it guessed rather than read, with the values saved: marked for a look on setup.
      SetupGuesses.rememberFromPlan(seasons[0].Camp__c, plan, keys);
      writer.result.importId = record(plan, writer);
      writer.result.openNotKept = ImportLog.openNotKept;
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw e;
    } finally {
      SetTimeGuard.resume();
    }
    return writer.result;
  }

  /**
   * The import's own record: its files, what it created and changed (for Undo), and the
   * questions left open with the files read, so they can be answered later (INGEST-5.5).
   */
  private static Id record(ImportPlan plan, ImportWriter writer) {
    return ImportLog.record(
      plan,
      JSON.serialize(writer.created),
      JSON.serialize(writer.changed)
    );
  }
}
