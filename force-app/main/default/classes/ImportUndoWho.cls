/**
 * Undo, for who lists a list import replaced (slice 4c: who can do an activity, or who a
 * recurring activity covers, set up before): puts the old list back, unless the list was edited
 * since (it is no longer what the import wrote), which keeps it and names it, as for any other
 * change.
 */
public with sharing class ImportUndoWho {
  private ImportUndo.Result result;
  private Map<Id, SObject> now = new Map<Id, SObject>();
  private Set<Id> stillThere = new Set<Id>();
  private List<SObject> remove = new List<SObject>();
  private List<SObject> putBack = new List<SObject>();
  // Each put-back row's owner name, in the same order (for a refusal's message).
  private List<String> putBackNames = new List<String>();

  public ImportUndoWho(ImportUndo.Result result) {
    this.result = result;
  }

  /** entries: [{ who: owner id, type (the rows' object), name, before, after: [target ids] }]. */
  public void run(List<Object> entries) {
    if (entries.isEmpty()) {
      return;
    }
    read(entries);
    for (Object item : entries) {
      undoOne((Map<String, Object>) item);
    }
    Database.delete(remove, AccessLevel.USER_MODE);
    List<Database.SaveResult> outcomes = Database.insert(
      putBack,
      false,
      AccessLevel.USER_MODE
    );
    for (Integer i = 0; i < outcomes.size(); i++) {
      if (!outcomes[i].isSuccess()) {
        throw ImportUndo.refused(
          putBackNames[i],
          'couldn\'t put back who it was for',
          outcomes[i].getErrors()[0]
        );
      }
    }
  }

  /** The owners as they are now (kind by kind), and which divisions and groups still exist. */
  private void read(List<Object> entries) {
    Map<String, Set<Id>> ownersByType = new Map<String, Set<Id>>();
    Set<Id> targets = new Set<Id>();
    for (Object item : entries) {
      Map<String, Object> entry = (Map<String, Object>) item;
      String type = (String) entry.get('type');
      if (!ownersByType.containsKey(type)) {
        ownersByType.put(type, new Set<Id>());
      }
      ownersByType.get(type).add((Id) (String) entry.get('who'));
      for (String target : texts((List<Object>) entry.get('before'))) {
        targets.add((Id) target);
      }
    }
    for (String type : ownersByType.keySet()) {
      now.putAll(
        ImportWhoKinds.forChild(type).ownersWithRows(ownersByType.get(type))
      );
    }
    for (Division__c row : [
      SELECT Id
      FROM Division__c
      WHERE Id IN :targets
      WITH USER_MODE
    ]) {
      stillThere.add(row.Id);
    }
    for (Group__c row : [
      SELECT Id
      FROM Group__c
      WHERE Id IN :targets
      WITH USER_MODE
    ]) {
      stillThere.add(row.Id);
    }
  }

  private void undoOne(Map<String, Object> entry) {
    SObject owner = now.get((Id) (String) entry.get('who'));
    if (owner == null) {
      result.gone.add((String) entry.get('name'));
      return;
    }
    ImportWhoKinds.Kind kind = ImportWhoKinds.forChild(
      (String) entry.get('type')
    );
    List<SObject> rows = owner.getSObjects(kind.relationship) ??
      new List<SObject>();
    List<String> current = new List<String>();
    for (SObject row : rows) {
      current.add(ImportWhoKinds.targetOf(row));
    }
    current.sort();
    if (current != texts((List<Object>) entry.get('after'))) {
      result.keptEdited.add((String) owner.get('Name'));
      return;
    }
    remove.addAll(rows);
    Boolean missing = false;
    for (String target : texts((List<Object>) entry.get('before'))) {
      if (!stillThere.contains((Id) target)) {
        // A division or group deleted since can't be put back in the list.
        missing = true;
        continue;
      }
      SObject row = kind.row(owner.Id, (Id) target, seasonOf(owner));
      putBackNames.add((String) owner.get('Name'));
      putBack.add(row);
    }
    if (missing) {
      result.gone.add((String) owner.get('Name'));
    }
    result.restored++;
  }

  /** A recurring activity's coverage belongs to its season too. */
  private Id seasonOf(SObject owner) {
    return owner.getSObjectType() == RecurringActivity__c.SObjectType
      ? seasons.get(owner.Id)
      : null;
  }

  private Map<Id, Id> seasons {
    get {
      if (seasons == null) {
        Set<Id> ids = now.keySet();
        seasons = new Map<Id, Id>();
        for (RecurringActivity__c item : [
          SELECT Id, Program__r.Season__c
          FROM RecurringActivity__c
          WHERE Id IN :ids
          WITH USER_MODE
        ]) {
          seasons.put(item.Id, item.Program__r.Season__c);
        }
      }
      return seasons;
    }
    set;
  }

  private static List<String> texts(List<Object> values) {
    List<String> result = new List<String>();
    for (Object value : values) {
      result.add((String) value);
    }
    result.sort();
    return result;
  }
}
