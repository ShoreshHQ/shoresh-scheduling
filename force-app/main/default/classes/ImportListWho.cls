/**
 * Who can do each activity in an imported list (slice 4c): a new activity's list is added; an
 * existing one's is replaced only when the director chose Change (the list is sent only then),
 * and what it was is logged so Undo last import can put it back (ImportUndoWho).
 */
public with sharing class ImportListWho {
  private ImportWriter writer;
  private List<SObject> added = new List<SObject>();
  private List<SObject> replacing = new List<SObject>();
  private Map<Id, List<String>> after = new Map<Id, List<String>>();

  public ImportListWho(ImportWriter writer) {
    this.writer = writer;
  }

  /** entries and rows in the same order, the rows saved. */
  public void save(List<ImportPlan.Entry> entries, List<SObject> rows) {
    for (Integer i = 0; i < entries.size(); i++) {
      if (entries[i].has('who')) {
        collect(entries[i], rows[i].Id);
      }
    }
    writer.saveTracked('ActivityEligibility', added);
    if (!after.isEmpty()) {
      replace();
    }
  }

  private void collect(ImportPlan.Entry entry, Id activityId) {
    List<SObject> who = new List<SObject>();
    List<String> targets = new List<String>();
    for (String target : entry.texts('who')) {
      Id targetId = writer.keys.of(target);
      ActivityEligibility__c row = new ActivityEligibility__c(
        Activity__c = activityId
      );
      row.put(ImportItemWrites.targetField(targetId), targetId);
      who.add(row);
      targets.add(targetId);
    }
    if (entry.isNew()) {
      added.addAll(who);
    } else {
      replacing.addAll(who);
      targets.sort();
      after.put(activityId, targets);
    }
  }

  /** Existing activities' lists: the old rows go, the new ones come, and both are logged. */
  private void replace() {
    Set<Id> owners = after.keySet();
    List<ActivityEligibility__c> old = new List<ActivityEligibility__c>();
    for (Activity__c activity : [
      SELECT Id, Name, (SELECT Id, Division__c, Group__c FROM Eligibilities__r)
      FROM Activity__c
      WHERE Id IN :owners
      WITH USER_MODE
    ]) {
      List<String> before = new List<String>();
      for (ActivityEligibility__c row : activity.Eligibilities__r) {
        before.add(row.Division__c != null ? row.Division__c : row.Group__c);
        old.add(row);
      }
      before.sort();
      writer.logWho(activity, before, after.get(activity.Id));
    }
    Database.delete(old, AccessLevel.USER_MODE);
    UserModeWrites.save(replacing);
  }
}
