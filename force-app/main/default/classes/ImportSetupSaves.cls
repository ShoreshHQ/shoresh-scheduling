/**
 * Saves the setup an import proposes, once the director has answered every question (slice 4b):
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

    public Result() {
      added = new Map<String, Integer>();
      changed = new Map<String, Integer>();
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
    List<Season__c> seasons = [
      SELECT Id, Camp__c
      FROM Season__c
      WHERE Id = :plan.seasonId
      WITH USER_MODE
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
    SetTimeGuard.defer();
    Savepoint beforeSave = Database.setSavepoint();
    try {
      new ImportStructureWrites(plan, writer).run();
      new ImportItemWrites(plan, writer).run();
      SetTimeGuard.checkPending();
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw e;
    } finally {
      SetTimeGuard.resume();
    }
    return writer.result;
  }
}
