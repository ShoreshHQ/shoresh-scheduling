/**
 * What only a camp workbook saves (slice 4c part D), beside its lists: weeks an item runs again
 * (a week off removed), and the camp's words. Both are logged so Undo last import puts them back
 * (Greg: camp words are undone with the rest), unless edited since.
 */
public with sharing class ImportWorkbookExtras {
  private ImportWriter writer;
  private Id seasonId;
  private Id campId;

  public ImportWorkbookExtras(ImportWriter writer, Id seasonId, Id campId) {
    this.writer = writer;
    this.seasonId = seasonId;
    this.campId = campId;
  }

  /**
   * Removes weeks off (WeekException__c) the workbook ticks back on; each must be in the season.
   * Logged as { weekOn, week, field, target, name } for Undo.
   */
  public void weeksBackOn(List<ImportPlan.Entry> entries) {
    Set<Id> ids = new Set<Id>();
    for (ImportPlan.Entry entry : entries) {
      Id recordId = entry.id();
      if (
        recordId == null ||
        recordId.getSObjectType() != WeekException__c.SObjectType
      ) {
        throw ImportListSaves.unreadable();
      }
      ids.add(recordId);
    }
    if (ids.isEmpty()) {
      return;
    }
    List<WeekException__c> found = [
      SELECT
        Id,
        Week__c,
        Week__r.Name,
        Group__c,
        Location__c,
        Activity__c,
        FixedActivity__c,
        RecurringActivity__c
      FROM WeekException__c
      WHERE Id IN :ids AND Week__r.Season__c = :seasonId
      WITH USER_MODE
    ];
    if (found.size() != ids.size()) {
      throw ImportListSaves.unreadable();
    }
    for (WeekException__c off : found) {
      String field = targetField(off);
      Id target = (Id) off.get(field);
      writer.logWeekBackOn(
        new Map<String, Object>{
          'weekOn' => off.Id,
          'week' => off.Week__c,
          'field' => field,
          'target' => target,
          'name' => off.Week__r.Name
        },
        target
      );
    }
    Database.delete(found, AccessLevel.USER_MODE);
  }

  private static String targetField(WeekException__c off) {
    for (
      String field : new List<String>{
        'Group__c',
        'Location__c',
        'Activity__c',
        'FixedActivity__c',
        'RecurringActivity__c'
      }
    ) {
      if (off.get(field) != null) {
        return field;
      }
    }
    throw ImportListSaves.unreadable();
  }

  /** The camp's words the director chose to change: [{ term, fields: { Singular__c, Plural__c } }]. */
  public void campWords(List<ImportPlan.Entry> entries) {
    if (entries.isEmpty()) {
      return;
    }
    String why = CampLabels.whyCannotEdit(campId);
    if (why != null) {
      throw new ShoreshException(why);
    }
    Map<String, CampLabel__c> current = new Map<String, CampLabel__c>();
    for (CampLabel__c label : [
      SELECT Id, ModelTerm__c
      FROM CampLabel__c
      WHERE Camp__c = :campId
      WITH USER_MODE
    ]) {
      current.put(label.ModelTerm__c, label);
    }
    List<SObject> added = new List<SObject>();
    List<SObject> changed = new List<SObject>();
    for (CampLabel__c label : labelsOf(entries)) {
      if (current.containsKey(label.ModelTerm__c)) {
        changed.add(
          new CampLabel__c(
            Id = current.get(label.ModelTerm__c).Id,
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
  }

  /** Each entry as a word for one of Shoresh's terms, once each, never blank. */
  private static List<CampLabel__c> labelsOf(List<ImportPlan.Entry> entries) {
    Set<String> terms = new Set<String>();
    for (CampLabels.TermLabel label : CampLabels.modelTermsOnly().all()) {
      terms.add(label.term);
    }
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
          Singular__c = word(fields.get('Singular__c')),
          Plural__c = word(fields.get('Plural__c'))
        )
      );
    }
    return result;
  }

  private static String word(Object value) {
    String text = value == null ? '' : String.valueOf(value).trim();
    if (String.isBlank(text) || text.length() > 80) {
      throw ImportListSaves.unreadable();
    }
    return text;
  }
}
