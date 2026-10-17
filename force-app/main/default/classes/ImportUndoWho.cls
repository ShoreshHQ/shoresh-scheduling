/**
 * Undo, for who lists a list import replaced (slice 4c: "Who can do it" on an activity set up
 * before): puts the old list back, unless the list was edited since (it is no longer what the
 * import wrote), which keeps it and names it, as for any other change.
 */
public with sharing class ImportUndoWho {
  private ImportUndo.Result result;
  private Map<Id, Activity__c> now;
  private Set<Id> stillThere;
  private List<SObject> remove = new List<SObject>();
  private List<SObject> putBack = new List<SObject>();

  public ImportUndoWho(ImportUndo.Result result) {
    this.result = result;
  }

  /** entries: [{ who: activity id, type, name, before: [target ids], after: [target ids] }]. */
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
          now.get((Id) putBack[i].get('Activity__c')).Name,
          'couldn\'t put back who could do it',
          outcomes[i].getErrors()[0]
        );
      }
    }
  }

  /** The activities as they are now, and which divisions and groups still exist. */
  private void read(List<Object> entries) {
    Set<Id> owners = new Set<Id>();
    Set<Id> targets = new Set<Id>();
    for (Object item : entries) {
      Map<String, Object> entry = (Map<String, Object>) item;
      owners.add((Id) (String) entry.get('who'));
      for (String target : texts((List<Object>) entry.get('before'))) {
        targets.add((Id) target);
      }
    }
    now = new Map<Id, Activity__c>(
      [
        SELECT
          Id,
          Name,
          (SELECT Id, Division__c, Group__c FROM Eligibilities__r)
        FROM Activity__c
        WHERE Id IN :owners
        WITH USER_MODE
      ]
    );
    stillThere = new Set<Id>();
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
    Activity__c activity = now.get((Id) (String) entry.get('who'));
    if (activity == null) {
      result.gone.add((String) entry.get('name'));
      return;
    }
    List<String> current = new List<String>();
    for (ActivityEligibility__c row : activity.Eligibilities__r) {
      current.add(row.Division__c != null ? row.Division__c : row.Group__c);
    }
    current.sort();
    if (current != texts((List<Object>) entry.get('after'))) {
      result.keptEdited.add(activity.Name);
      return;
    }
    remove.addAll(activity.Eligibilities__r);
    Boolean missing = false;
    for (String target : texts((List<Object>) entry.get('before'))) {
      if (!stillThere.contains((Id) target)) {
        // A division or group deleted since can't be put back in the list.
        missing = true;
        continue;
      }
      ActivityEligibility__c row = new ActivityEligibility__c(
        Activity__c = activity.Id
      );
      row.put(ImportItemWrites.targetField((Id) target), (Id) target);
      putBack.add(row);
    }
    if (missing) {
      result.gone.add(activity.Name);
    }
    result.restored++;
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
