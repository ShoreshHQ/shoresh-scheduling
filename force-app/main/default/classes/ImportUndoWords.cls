/**
 * Undo, for a camp workbook (slice 4c part D): puts back the camp words the workbook set back
 * to Shoresh's own (it removed them, as the camp words editor does), unless the camp has a word
 * for that term again since, which is kept and named. Every value comes from the import's
 * record, so each is checked.
 */
public with sharing class ImportUndoWords {
  private ImportUndo.Result result;
  private Id campId;

  public ImportUndoWords(ImportUndo.Result result, Id campId) {
    this.result = result;
    this.campId = campId;
  }

  public void run(List<ImportLogEntries.WordOff> entries) {
    if (entries.isEmpty()) {
      return;
    }
    Set<String> terms = new Set<String>();
    for (CampLabels.TermLabel label : CampLabels.modelTermsOnly().all()) {
      terms.add(label.term);
    }
    Map<String, CampLabel__c> now = new Map<String, CampLabel__c>();
    for (CampLabel__c label : [
      SELECT Id, ModelTerm__c, Singular__c
      FROM CampLabel__c
      WHERE Camp__c = :campId
      WITH USER_MODE
    ]) {
      now.put(label.ModelTerm__c, label);
    }
    List<CampLabel__c> toAdd = new List<CampLabel__c>();
    for (ImportLogEntries.WordOff entry : entries) {
      CampLabel__c label = entry.label(campId, terms);
      if (now.containsKey(label.ModelTerm__c)) {
        // A word chosen since: the camp's choice stays.
        result.keptEdited.add(now.get(label.ModelTerm__c).Singular__c);
      } else {
        toAdd.add(label);
      }
    }
    List<Database.SaveResult> outcomes = Database.insert(
      toAdd,
      false,
      AccessLevel.USER_MODE
    );
    for (Integer i = 0; i < outcomes.size(); i++) {
      if (!outcomes[i].isSuccess()) {
        throw ImportUndo.refused(
          toAdd[i].Singular__c,
          'couldn\'t put it back',
          outcomes[i].getErrors()[0]
        );
      }
      result.restored++;
    }
  }
}
