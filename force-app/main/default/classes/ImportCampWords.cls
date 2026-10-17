/**
 * A camp workbook's camp words (slice 4c part D): each one the director chose to change is
 * added or changed, and Shoresh's own word is no camp word at all, as the camp words editor
 * saves it (a camp word set back to it is removed). All logged so Undo puts them back.
 */
public with sharing class ImportCampWords {
  private ImportWriter writer;
  private Id campId;

  public ImportCampWords(ImportWriter writer, Id campId) {
    this.writer = writer;
    this.campId = campId;
  }

  /** entries: [{ term, fields: { Singular__c, Plural__c } }]. */
  public void save(List<ImportPlan.Entry> entries) {
    if (entries.isEmpty()) {
      return;
    }
    String why = CampLabels.whyCannotEdit(campId);
    if (why != null) {
      throw new ShoreshException(why);
    }
    // Camp words are the camp's, shared by its seasons: two seasons' imports take turns.
    ImportUndo.lockCamp(campId);
    Map<String, CampLabels.TermLabel> defaults = defaults();
    Map<String, CampLabel__c> current = current();
    List<SObject> added = new List<SObject>();
    List<SObject> changed = new List<SObject>();
    List<CampLabel__c> cleared = new List<CampLabel__c>();
    for (CampLabel__c label : labelsOf(entries, defaults.keySet())) {
      CampLabel__c now = current.get(label.ModelTerm__c);
      if (isDefault(label, defaults.get(label.ModelTerm__c))) {
        if (now != null) {
          cleared.add(now);
        }
      } else if (now != null) {
        changed.add(
          new CampLabel__c(
            Id = now.Id,
            Singular__c = label.Singular__c,
            Plural__c = label.Plural__c
          )
        );
      } else {
        label.Camp__c = campId;
        added.add(label);
      }
    }
    writer.writeTracked('CampLabel', added, changed);
    for (CampLabel__c label : cleared) {
      writer.logWordOff(label);
    }
    Database.delete(cleared, AccessLevel.USER_MODE);
  }

  private static Boolean isDefault(
    CampLabel__c label,
    CampLabels.TermLabel model
  ) {
    return label.Singular__c == model.modelSingular &&
      label.Plural__c == model.modelPlural;
  }

  private static Map<String, CampLabels.TermLabel> defaults() {
    Map<String, CampLabels.TermLabel> result = new Map<String, CampLabels.TermLabel>();
    for (CampLabels.TermLabel label : CampLabels.modelTermsOnly().all()) {
      result.put(label.term, label);
    }
    return result;
  }

  private Map<String, CampLabel__c> current() {
    Map<String, CampLabel__c> result = new Map<String, CampLabel__c>();
    for (CampLabel__c label : [
      SELECT Id, ModelTerm__c, Singular__c, Plural__c
      FROM CampLabel__c
      WHERE Camp__c = :campId
      WITH USER_MODE
    ]) {
      result.put(label.ModelTerm__c, label);
    }
    return result;
  }

  /** Each entry as a word for one of Shoresh's terms, once each, never blank. */
  private static List<CampLabel__c> labelsOf(
    List<ImportPlan.Entry> entries,
    Set<String> terms
  ) {
    List<CampLabel__c> result = new List<CampLabel__c>();
    Set<String> seen = new Set<String>();
    for (ImportPlan.Entry entry : entries) {
      String term = entry.text('term');
      Map<String, Object> fields = entry.valuesOf('fields');
      if (!terms.contains(term) || !seen.add(term) || fields.size() != 2) {
        throw ImportListSaves.unreadable();
      }
      result.add(
        new CampLabel__c(
          ModelTerm__c = term,
          Singular__c = ImportWorkbookExtras.word(fields.get('Singular__c')),
          Plural__c = ImportWorkbookExtras.word(fields.get('Plural__c'))
        )
      );
    }
    return result;
  }
}
