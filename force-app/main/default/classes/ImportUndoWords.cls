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

  /** entries: [{ wordOff, term, singular, plural }]. */
  public void run(List<Object> entries) {
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
    for (Object item : entries) {
      CampLabel__c label = checked((Map<String, Object>) item, terms);
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

  private CampLabel__c checked(Map<String, Object> entry, Set<String> terms) {
    if (
      ImportFields.ofRecord(entry.get('wordOff')) != CampLabel__c.SObjectType ||
      !terms.contains(word(entry, 'term'))
    ) {
      throw ImportFields.unreadableLog();
    }
    return new CampLabel__c(
      Camp__c = campId,
      ModelTerm__c = word(entry, 'term'),
      Singular__c = word(entry, 'singular'),
      Plural__c = word(entry, 'plural')
    );
  }

  private static String word(Map<String, Object> entry, String key) {
    Object value = entry.get(key);
    if (
      !(value instanceof String) ||
      String.isBlank((String) value) ||
      ((String) value).length() > 80
    ) {
      throw ImportFields.unreadableLog();
    }
    return (String) value;
  }
}
