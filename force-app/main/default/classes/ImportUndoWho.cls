/**
 * Undo, for who lists a list import replaced (slice 4c: "Who can do it" on an activity set up
 * before): puts the old list back, unless the list was edited since (it is no longer what the
 * import wrote), which keeps it and names it, as for any other change.
 */
public with sharing class ImportUndoWho {
  private ImportUndo.Result result;

  public ImportUndoWho(ImportUndo.Result result) {
    this.result = result;
  }

  /** entries: [{ who: activity id, type, name, before: [target ids], after: [target ids] }]. */
  public void run(List<Object> entries) {
    if (entries.isEmpty()) {
      return;
    }
    Set<Id> owners = new Set<Id>();
    Set<Id> targets = new Set<Id>();
    for (Object item : entries) {
      Map<String, Object> entry = (Map<String, Object>) item;
      owners.add((Id) (String) entry.get('who'));
      for (Object target : (List<Object>) entry.get('before')) {
        targets.add((Id) (String) target);
      }
    }
    Map<Id, Activity__c> now = new Map<Id, Activity__c>(
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
    Set<Id> stillThere = stillThere(targets);
    List<SObject> remove = new List<SObject>();
    List<SObject> putBack = new List<SObject>();
    for (Object item : entries) {
      Map<String, Object> entry = (Map<String, Object>) item;
      Activity__c activity = now.get((Id) (String) entry.get('who'));
      if (activity == null) {
        result.gone.add((String) entry.get('name'));
        continue;
      }
      List<String> current = new List<String>();
      for (ActivityEligibility__c row : activity.Eligibilities__r) {
        current.add(row.Division__c != null ? row.Division__c : row.Group__c);
      }
      current.sort();
      if (current != texts((List<Object>) entry.get('after'))) {
        result.keptEdited.add(activity.Name);
        continue;
      }
      remove.addAll(activity.Eligibilities__r);
      Boolean missing = false;
      for (Object target : (List<Object>) entry.get('before')) {
        Id targetId = (Id) (String) target;
        if (!stillThere.contains(targetId)) {
          // A division or group deleted since can't be put back in the list.
          missing = true;
          continue;
        }
        ActivityEligibility__c row = new ActivityEligibility__c(
          Activity__c = activity.Id
        );
        row.put(ImportItemWrites.targetField(targetId), targetId);
        putBack.add(row);
      }
      if (missing) {
        result.gone.add(activity.Name);
      }
      result.restored++;
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

  private static List<String> texts(List<Object> values) {
    List<String> result = new List<String>();
    for (Object value : values) {
      result.add((String) value);
    }
    result.sort();
    return result;
  }

  /** The divisions and groups among these that still exist. */
  private static Set<Id> stillThere(Set<Id> ids) {
    Set<Id> result = new Set<Id>();
    for (Division__c row : [
      SELECT Id
      FROM Division__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      result.add(row.Id);
    }
    for (Group__c row : [
      SELECT Id
      FROM Group__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      result.add(row.Id);
    }
    return result;
  }
}
