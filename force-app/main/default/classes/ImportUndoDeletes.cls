/**
 * Undo, part one: removes the records an import created, children first, keeping any edited
 * since (a field no longer holds what the import wrote) or still in use (something not made by
 * the import is inside it or points at it).
 */
public with sharing class ImportUndoDeletes {
  // Children first. Who-can-do-it rows go with their activity.
  private static final List<String> ORDER = new List<String>{
    'Schedule',
    'Coverage',
    'RecurringActivity',
    'FixedActivity',
    'Activity',
    'Location',
    'Group',
    'Division',
    'TimeBlock',
    'Program'
  };
  // Records inside each kind (master-detail): anything left there keeps it.
  private static final Map<String, List<List<String>>> INSIDE = new Map<String, List<List<String>>>{
    'Program' => new List<List<String>>{
      new List<String>{ 'Division__c', 'Program__c' },
      new List<String>{ 'TimeBlock__c', 'Program__c' },
      new List<String>{ 'FixedActivity__c', 'Program__c' },
      new List<String>{ 'RecurringActivity__c', 'Program__c' },
      new List<String>{ 'Schedule__c', 'Program__c' }
    },
    'Division' => new List<List<String>>{
      new List<String>{ 'Group__c', 'Division__c' }
    },
    'Activity' => new List<List<String>>{
      new List<String>{ 'ActivityEligibility__c', 'Activity__c' }
    }
  };

  private ImportUndo.Result result;
  private Set<Id> createdIds = new Set<Id>();

  public ImportUndoDeletes(ImportUndo.Result result) {
    this.result = result;
  }

  public void run(Map<String, Object> created) {
    for (Object entries : created.values()) {
      for (Object entry : (List<Object>) entries) {
        createdIds.add((Id) (String) ((Map<String, Object>) entry).get('id'));
      }
    }
    for (String term : ORDER) {
      if (created.containsKey(term)) {
        remove(term, (List<Object>) created.get(term));
      }
    }
  }

  private void remove(String term, List<Object> entries) {
    Map<Id, Map<String, Object>> written = new Map<Id, Map<String, Object>>();
    Set<String> fields = new Set<String>();
    for (Object item : entries) {
      Map<String, Object> entry = (Map<String, Object>) item;
      Map<String, Object> values = (Map<String, Object>) entry.get('fields');
      written.put((Id) (String) entry.get('id'), values);
      fields.addAll(values.keySet());
    }
    String objectName = term + '__c';
    Map<Id, SObject> now = ImportUndoValues.read(
      objectName,
      fields,
      written.keySet()
    );
    Set<Id> holding = holdingOthers(term, now.keySet());
    List<SObject> toDelete = new List<SObject>();
    for (SObject record : now.values()) {
      if (!ImportUndoValues.unchanged(record, written.get(record.Id))) {
        result.keptEdited.add((String) record.get('Name'));
      } else if (holding.contains(record.Id)) {
        result.keptInUse.add((String) record.get('Name'));
      } else {
        toDelete.add(record);
      }
    }
    deleteAll(toDelete);
  }

  /** Records with something inside them the import did not make (one query per kind inside). */
  private Set<Id> holdingOthers(String term, Set<Id> ids) {
    Set<Id> result = new Set<Id>();
    for (
      List<String> child : INSIDE.containsKey(term)
        ? INSIDE.get(term)
        : new List<List<String>>()
    ) {
      // Object and field names are the constants above.
      for (
        SObject inside : Database.queryWithBinds(
          'SELECT ' +
            child[1] +
            ' FROM ' +
            child[0] +
            ' WHERE ' +
            child[1] +
            ' IN :ids AND Id NOT IN :createdIds',
          new Map<String, Object>{ 'ids' => ids, 'createdIds' => createdIds },
          AccessLevel.USER_MODE
        )
      ) {
        result.add((Id) inside.get(child[1]));
      }
    }
    return result;
  }

  /** Deletes what it can; what Salesforce refuses (still pointed at) is kept, by name. */
  private void deleteAll(List<SObject> records) {
    List<Database.DeleteResult> outcomes = Database.delete(
      records,
      false,
      AccessLevel.USER_MODE
    );
    for (Integer i = 0; i < outcomes.size(); i++) {
      if (outcomes[i].isSuccess()) {
        result.removed++;
      } else {
        result.keptInUse.add((String) records[i].get('Name'));
      }
    }
  }
}
