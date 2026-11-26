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

  public void run(List<ImportLogEntries.Who> entries) {
    if (entries.isEmpty()) {
      return;
    }
    read(entries);
    for (ImportLogEntries.Who entry : entries) {
      undoOne(entry);
    }
    // One kind a call: Salesforce refuses one save whose rows switch kind more than ten times,
    // counted 200 rows at a time (#465), and a large camp's lists run to thousands of rows of
    // both kinds (INGEST-5.10).
    for (List<SObject> sameKind : byKind(remove).values()) {
      Database.delete(sameKind, AccessLevel.USER_MODE);
    }
    Map<Schema.SObjectType, List<SObject>> putBackByKind = byKind(putBack);
    Map<Schema.SObjectType, List<String>> namesByKind = new Map<Schema.SObjectType, List<String>>();
    for (Integer i = 0; i < putBack.size(); i++) {
      Schema.SObjectType kind = putBack[i].getSObjectType();
      if (!namesByKind.containsKey(kind)) {
        namesByKind.put(kind, new List<String>());
      }
      namesByKind.get(kind).add(putBackNames[i]);
    }
    for (Schema.SObjectType kind : putBackByKind.keySet()) {
      List<Database.SaveResult> outcomes = Database.insert(
        putBackByKind.get(kind),
        false,
        AccessLevel.USER_MODE
      );
      for (Integer i = 0; i < outcomes.size(); i++) {
        if (!outcomes[i].isSuccess()) {
          throw ImportUndo.refused(
            namesByKind.get(kind)[i],
            'couldn\'t put back who it was for',
            outcomes[i].getErrors()[0]
          );
        }
      }
    }
  }

  /** Rows by their kind, each kind's in the order given. */
  private static Map<Schema.SObjectType, List<SObject>> byKind(
    List<SObject> rows
  ) {
    Map<Schema.SObjectType, List<SObject>> result = new Map<Schema.SObjectType, List<SObject>>();
    for (SObject row : rows) {
      Schema.SObjectType kind = row.getSObjectType();
      if (!result.containsKey(kind)) {
        result.put(kind, new List<SObject>());
      }
      result.get(kind).add(row);
    }
    return result;
  }

  /** The owners as they are now (kind by kind), and which divisions and groups still exist. */
  private void read(List<ImportLogEntries.Who> entries) {
    // By each kind's term: the kinds are objects without equals/hashCode of their own.
    Map<String, ImportWhoKinds.Kind> kinds = new Map<String, ImportWhoKinds.Kind>();
    Map<String, Set<Id>> ownersByKind = new Map<String, Set<Id>>();
    Set<Id> targets = new Set<Id>();
    for (ImportLogEntries.Who entry : entries) {
      ImportWhoKinds.Kind kind = entry.kind();
      if (!kinds.containsKey(kind.term)) {
        kinds.put(kind.term, kind);
        ownersByKind.put(kind.term, new Set<Id>());
      }
      ownersByKind.get(kind.term).add(entry.ownerId());
      targets.addAll(entry.before());
    }
    for (String term : kinds.keySet()) {
      now.putAll(kinds.get(term).ownersWithRows(ownersByKind.get(term)));
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

  private void undoOne(ImportLogEntries.Who entry) {
    SObject owner = now.get(entry.ownerId());
    if (owner == null) {
      result.gone.add(entry.name());
      return;
    }
    ImportWhoKinds.Kind kind = entry.kind();
    List<SObject> rows = owner.getSObjects(kind.relationship) ??
      new List<SObject>();
    List<String> current = new List<String>();
    for (SObject row : rows) {
      current.add(ImportWhoKinds.targetOf(row));
    }
    current.sort();
    if (current != entry.after()) {
      result.keptEdited.add((String) owner.get('Name'));
      return;
    }
    remove.addAll(rows);
    Boolean missing = false;
    for (Id target : entry.before()) {
      if (!stillThere.contains(target)) {
        // A division or group deleted since can't be put back in the list.
        missing = true;
        continue;
      }
      SObject row = kind.row(owner.Id, target, seasonOf(owner));
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
}
