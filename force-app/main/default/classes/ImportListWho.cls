/**
 * Who each item of an imported list is for (slice 4c): who can do an activity
 * (ActivityEligibility__c) or who a recurring activity covers (Coverage__c). A new item's list is
 * added; an existing one's is replaced only when the director chose Change (the list is sent
 * only then), and what it was is logged so Undo last import can put it back (ImportUndoWho).
 */
public with sharing class ImportListWho {
  private ImportWriter writer;
  private ImportWhoKinds.Kind who;
  private Id seasonId;
  private List<SObject> added = new List<SObject>();
  private List<SObject> replacing = new List<SObject>();
  private Map<Id, List<String>> after = new Map<Id, List<String>>();

  /** ownerKind: "Activity" or "RecurringActivity". */
  public ImportListWho(ImportWriter writer, String ownerKind, Id seasonId) {
    this.writer = writer;
    this.who = ImportWhoKinds.forOwner(ownerKind);
    this.seasonId = seasonId;
  }

  /** entries and rows in the same order, the rows saved. */
  public void save(List<ImportPlan.Entry> entries, List<SObject> rows) {
    for (Integer i = 0; i < entries.size(); i++) {
      if (entries[i].has('who')) {
        collect(entries[i], rows[i].Id);
      }
    }
    writer.saveTracked(who.term, added);
    if (!after.isEmpty()) {
      replace();
    }
  }

  private void collect(ImportPlan.Entry entry, Id ownerId) {
    List<SObject> rows = new List<SObject>();
    List<String> targets = new List<String>();
    for (String target : entry.texts('who')) {
      Id targetId = writer.keys.of(target);
      rows.add(who.row(ownerId, targetId, seasonId));
      targets.add(targetId);
    }
    if (entry.isNew()) {
      added.addAll(rows);
    } else {
      replacing.addAll(rows);
      targets.sort();
      after.put(ownerId, targets);
    }
  }

  /** Existing items' lists: the old rows go, the new ones come, and both are logged. */
  private void replace() {
    List<SObject> old = new List<SObject>();
    for (SObject owner : who.ownersWithRows(after.keySet())) {
      List<String> before = new List<String>();
      for (
        SObject row : owner.getSObjects(who.relationship) ?? new List<SObject>()
      ) {
        before.add(ImportWhoKinds.targetOf(row));
        old.add(row);
      }
      before.sort();
      writer.logWho(owner, who.childType, before, after.get(owner.Id));
    }
    Database.delete(old, AccessLevel.USER_MODE);
    UserModeWrites.save(replacing);
  }
}
