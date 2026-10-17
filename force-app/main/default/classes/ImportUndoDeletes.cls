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
    'LocationType',
    'Group',
    'Division',
    'TimeBlock',
    'Program'
  };
  // Records inside each kind (master-detail children), or pointing at it through a link that
  // would quietly clear (a time block an item ends at, an activity used as a rain plan):
  // anything there not made by the import, or kept by this Undo, keeps it.
  private static final Map<String, List<String>> INSIDE = new Map<String, List<String>>{
    'Program' => new List<String>{
      'Divisions__r',
      'TimeBlocks__r',
      'FixedActivities__r',
      'RecurringActivities__r',
      'Schedules__r'
    },
    'Division' => new List<String>{ 'Groups__r' },
    'TimeBlock' => new List<String>{
      'EndingFixedActivities__r',
      'EndingRecurringActivities__r'
    },
    'Activity' => new List<String>{ 'Eligibilities__r', 'RainPlanFor__r' },
    // A type's locations would quietly lose it: one the import didn't add keeps it.
    'LocationType' => new List<String>{ 'Locations__r' }
  };

  private ImportUndo.Result result;
  private Set<Id> createdIds = new Set<Id>();

  public ImportUndoDeletes(ImportUndo.Result result) {
    this.result = result;
  }

  public void run(Map<String, Object> created) {
    for (Object kind : created.values()) {
      for (
        Object row : (List<Object>) ((Map<String, Object>) kind).get('rows')
      ) {
        createdIds.add((Id) (String) ((List<Object>) row)[0]);
      }
    }
    // Who-can-do-it rows are not removed on their own: they go with their activity.
    for (String term : ORDER) {
      if (created.containsKey(term)) {
        remove(term, (Map<String, Object>) created.get(term));
      }
    }
  }

  private void remove(String term, Map<String, Object> kind) {
    List<List<String>> fieldsets = new List<List<String>>();
    Set<String> fields = new Set<String>();
    for (Object fieldset : (List<Object>) kind.get('fieldsets')) {
      List<String> names = new List<String>();
      for (Object name : (List<Object>) fieldset) {
        names.add((String) name);
      }
      fieldsets.add(names);
      fields.addAll(names);
    }
    Map<Id, List<Object>> rows = new Map<Id, List<Object>>();
    for (Object row : (List<Object>) kind.get('rows')) {
      rows.put((Id) (String) ((List<Object>) row)[0], (List<Object>) row);
    }
    Map<Id, SObject> now = ImportUndoValues.read(
      term + '__c',
      fields,
      rows.keySet()
    );
    Set<Id> holding = holdingOthers(term, now.keySet());
    List<SObject> toDelete = new List<SObject>();
    for (SObject record : now.values()) {
      List<Object> row = rows.get(record.Id);
      List<String> written = fieldsets[(Integer) row[1]];
      if (ImportUndoLog.digest(record, written) != (String) row[2]) {
        keep(record, result.keptEdited);
      } else if (holding.contains(record.Id)) {
        keep(record, result.keptInUse);
      } else {
        toDelete.add(record);
      }
    }
    deleteAll(toDelete);
  }

  /** A record kept is no longer the import's: whatever it is inside is kept too. */
  private void keep(SObject record, List<String> names) {
    createdIds.remove(record.Id);
    names.add((String) record.get('Name'));
  }

  /** Records with something inside them the import did not make (one query, with sub-queries). */
  private Set<Id> holdingOthers(String term, Set<Id> ids) {
    Set<Id> result = new Set<Id>();
    if (!INSIDE.containsKey(term)) {
      return result;
    }
    List<String> subqueries = new List<String>();
    for (String relationship : INSIDE.get(term)) {
      subqueries.add(
        '(SELECT Id FROM ' +
          relationship +
          ' WHERE Id NOT IN :createdIds LIMIT 1)'
      );
    }
    // Object and relationship names are the constants above.
    for (
      SObject record : Database.queryWithBinds(
        'SELECT Id, ' +
          String.join(subqueries, ', ') +
          ' FROM ' +
          term +
          '__c WHERE Id IN :ids',
        new Map<String, Object>{ 'ids' => ids, 'createdIds' => createdIds },
        AccessLevel.USER_MODE
      )
    ) {
      for (String relationship : INSIDE.get(term)) {
        // An empty sub-query reads as null, not an empty list.
        List<SObject> inside = record.getSObjects(relationship);
        if (inside != null && !inside.isEmpty()) {
          result.add(record.Id);
        }
      }
    }
    return result;
  }

  /**
   * Deletes what it can. A record something still points at is kept, by name; any other refusal
   * (a rule, a permission) stops the whole Undo with its reason, so nothing is half undone.
   */
  private void deleteAll(List<SObject> records) {
    List<Database.DeleteResult> outcomes = Database.delete(
      records,
      false,
      AccessLevel.USER_MODE
    );
    for (Integer i = 0; i < outcomes.size(); i++) {
      if (outcomes[i].isSuccess()) {
        result.removed++;
        continue;
      }
      Database.Error error = outcomes[i].getErrors()[0];
      if (error.getStatusCode() != StatusCode.DELETE_FAILED) {
        throw ImportUndo.refused(
          (String) records[i].get('Name'),
          'couldn\'t remove it',
          error
        );
      }
      keep(records[i], result.keptInUse);
    }
  }
}
