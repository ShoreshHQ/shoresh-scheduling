/**
 * Undo, part one: removes the records an import created, children first, keeping any edited
 * since (a field no longer holds what the import wrote) or still in use (something not made by
 * the import is inside it or points at it).
 */
public with sharing class ImportUndoDeletes {
  // Children first. Who-can-do-it rows go with their activity.
  private static final List<String> ORDER = new List<String>{
    // A batch from another system (IncomingBatch): choices before their campers.
    'Preference',
    'Camper',
    // A week's day the import made a special day (INGEST-4.3): its day first; its plan goes
    // with it (SpecialItemTriggerHandler).
    'SpecialDate',
    'SpecialDay',
    // Weeks items are off (a workbook's Runs in, slice 4c part D), before the items and weeks.
    'WeekException',
    'Schedule',
    'Coverage',
    // Linked choices a double period made (their periods go with them), then the offerings
    // (the Electives list's, or Import last year's), then their sets, before the activities.
    'LinkedChoice',
    'Offering',
    'ElectiveSet',
    'RecurringActivity',
    'FixedActivity',
    'Activity',
    'Location',
    'LocationType',
    'Group',
    'Division',
    'TimeBlock',
    'Program',
    'Week',
    'CampLabel'
  };
  // What a week off or a who row belongs to: decided before those rows go.
  private static final Set<String> ITEMS = new Set<String>{
    // Decided before its day goes: a special day kept keeps its day.
    'SpecialDay',
    'RecurringActivity',
    'FixedActivity',
    'Activity',
    'Location',
    'Group'
  };
  // Records inside each kind (master-detail children), or pointing at it through a link that
  // would quietly clear (a time block an item ends at, an activity used as a rain plan):
  // anything there not made by the import, or kept by this Undo, keeps it.
  // Each is the child's field pointing at the kind; the parent's list of them is looked up.
  private static final Map<String, List<Schema.SObjectField>> INSIDE = new Map<String, List<Schema.SObjectField>>{
    // A camper with choices or seats the batch didn't make keeps them.
    'Camper' => new List<Schema.SObjectField>{
      Preference__c.Camper__c,
      Assignment__c.Camper__c
    },
    'Program' => new List<Schema.SObjectField>{
      Division__c.Program__c,
      TimeBlock__c.Program__c,
      FixedActivity__c.Program__c,
      RecurringActivity__c.Program__c,
      Schedule__c.Program__c
    },
    'Division' => new List<Schema.SObjectField>{ Group__c.Division__c },
    // A week added by a workbook that anything else now uses (a version, a week off) stays.
    'Week' => new List<Schema.SObjectField>{
      WeekException__c.Week__c,
      Schedule__c.Week__c,
      SpecialDate__c.Week__c
    },
    // A special day put on another day by hand: kept.
    'SpecialDay' => new List<Schema.SObjectField>{
      SpecialDate__c.SpecialDay__c
    },
    'TimeBlock' => new List<Schema.SObjectField>{
      FixedActivity__c.LastTimeBlock__c,
      RecurringActivity__c.LastTimeBlock__c
    },
    'Activity' => new List<Schema.SObjectField>{
      ActivityEligibility__c.Activity__c,
      Activity__c.RainPlan__c,
      Offering__c.Activity__c
    },
    // Who it covers or weeks it is off that the import didn't make: kept, with what it made.
    'RecurringActivity' => new List<Schema.SObjectField>{
      Coverage__c.RecurringActivity__c,
      WeekException__c.RecurringActivity__c
    },
    // A type's locations would quietly lose it: one the import didn't add keeps it.
    'LocationType' => new List<Schema.SObjectField>{
      Location__c.LocationType__c
    },
    // A set's offerings and linked choices go with it (master-detail): one the import didn't
    // make keeps it, as does a run that uses it.
    'ElectiveSet' => new List<Schema.SObjectField>{
      Offering__c.ElectiveSet__c,
      LinkedChoice__c.ElectiveSet__c,
      ElectiveRun__c.ElectiveSet__c
    },
    // A linked choice's periods go with it (master-detail): a period added by hand keeps it, as
    // do who it is for and seats given in it.
    'LinkedChoice' => new List<Schema.SObjectField>{
      LinkedChoiceTime__c.LinkedChoice__c,
      Coverage__c.LinkedChoice__c,
      Assignment__c.LinkedChoice__c
    },
    // An offering's linked choices go with it (ElectiveSetupTriggers): one keeps it, as do
    // seats given in it.
    'Offering' => new List<Schema.SObjectField>{
      LinkedChoice__c.Offering__c,
      Assignment__c.Offering__c
    }
  };

  private ImportUndo.Result result;
  private ImportUndoCount count;
  private Set<Id> createdIds = new Set<Id>();
  // Records the import made that this Undo keeps (edited since, or in use).
  private Set<Id> keptIds = new Set<Id>();
  // What a special day this Undo keeps uses (its groups, activities, places): kept with it, by
  // the special day's name.
  private Map<Id, String> usedByKeptDays = new Map<Id, String>();

  // What later imports from another source changed (API-2.6): theirs too now, so kept.
  private ImportUndoLater later;

  public ImportUndoDeletes(ImportUndo.Result result, ImportUndoLater later) {
    this.result = result;
    this.later = later;
  }

  public void run(Map<String, Object> created) {
    collectCreated(created);
    count = new ImportUndoCount(createdIds);
    // Who-can-do-it rows and weeks off are not removed on their own: they go with their item. An
    // item kept (edited since, or in use) keeps who it covers and the weeks it is off, so items
    // are decided (in ORDER, as a kept one can hold another) before those rows are removed.
    Map<String, List<SObject>> decided = new Map<String, List<SObject>>();
    for (String term : ORDER) {
      if (ITEMS.contains(term) && created.containsKey(term)) {
        decided.put(
          term,
          decide(term, (Map<String, Object>) created.get(term))
        );
      }
    }
    for (String term : ORDER) {
      if (!created.containsKey(term)) {
        continue;
      }
      List<SObject> toDelete = decided.containsKey(term)
        ? decided.get(term)
        : decide(term, (Map<String, Object>) created.get(term));
      deleteAll(
        term,
        withoutKeptItems(
          term,
          ImportUndoSpecialDays.withoutKept(term, toDelete, keptIds)
        )
      );
    }
  }

  /**
   * Every record the import made. Only kinds an import makes, each holding only its own records:
   * an Id here counts as made by the import, so a hand-edited record can't make Undo remove
   * something else.
   */
  private void collectCreated(Map<String, Object> created) {
    for (String term : created.keySet()) {
      Schema.SObjectType type = ImportFields.ofTerm(term);
      for (
        Object row : (List<Object>) ((Map<String, Object>) created.get(term))
          .get('rows')
      ) {
        Object recordId = ((List<Object>) row)[0];
        if (ImportFields.ofRecord(recordId) != type) {
          throw ImportFields.unreadableLog();
        }
        createdIds.add((Id) (String) recordId);
      }
    }
  }

  /** Coverage rows and weeks off of an item this Undo keeps: kept with it, unnamed. */
  private List<SObject> withoutKeptItems(String term, List<SObject> rows) {
    if (term != 'Coverage' && term != 'WeekException') {
      return rows;
    }
    Set<Id> ids = new Map<Id, SObject>(rows).keySet();
    Set<Id> kept = term == 'Coverage'
      ? new Map<Id, Coverage__c>(
            [
              SELECT Id
              FROM Coverage__c
              WHERE Id IN :ids AND RecurringActivity__c IN :keptIds
              WITH USER_MODE
            ]
          )
          .keySet()
      : new Map<Id, WeekException__c>(
            [
              SELECT Id
              FROM WeekException__c
              WHERE
                Id IN :ids
                AND (Group__c IN :keptIds
                OR Location__c IN :keptIds
                OR Activity__c IN :keptIds
                OR FixedActivity__c IN :keptIds
                OR RecurringActivity__c IN :keptIds)
              WITH USER_MODE
            ]
          )
          .keySet();
    // Kept rows are no longer the import's, so a week the import added keeps them too.
    createdIds.removeAll(kept);
    keptIds.addAll(kept);
    List<SObject> result = new List<SObject>();
    for (SObject record : rows) {
      if (!kept.contains(record.Id)) {
        result.add(record);
      }
    }
    return result;
  }

  /** The records of one kind to delete; those edited since or holding others are kept. */
  private List<SObject> decide(String term, Map<String, Object> kind) {
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
      ImportFields.ofTerm(term),
      fields,
      rows.keySet()
    );
    result.removed += count.goneHolders(rows.keySet(), now.keySet());
    Set<Id> holding = holdingOthers(term, now.keySet());
    // A special day whose schedule the director saved since holds their work: kept.
    holding.addAll(ImportUndoSpecialDays.revised(term, now.keySet()));
    usedByKeptDays.putAll(ImportUndoSpecialDays.usedBy(keptIds, now.keySet()));
    holding.addAll(usedByKeptDays.keySet());
    List<SObject> toDelete = new List<SObject>();
    for (SObject record : now.values()) {
      List<Object> row = rows.get(record.Id);
      List<String> written = fieldsets[(Integer) row[1]];
      if (later.edited(record, written, (String) row[2])) {
        keep(record, result.keptEdited);
      } else if (holding.contains(record.Id)) {
        keep(record, result.keptInUse);
      } else {
        toDelete.add(record);
      }
    }
    return toDelete;
  }

  /** A record kept is no longer the import's: whatever it is inside is kept too. */
  private void keep(SObject record, List<String> names) {
    createdIds.remove(record.Id);
    keptIds.add(record.Id);
    names.add(
      ImportUndoSpecialDays.named(
        ImportFields.nameOf(record),
        usedByKeptDays.get(record.Id)
      )
    );
  }

  /** Records with something inside them the import did not make (one query, with sub-queries). */
  private Set<Id> holdingOthers(String term, Set<Id> ids) {
    Set<Id> result = new Set<Id>();
    if (!INSIDE.containsKey(term)) {
      return result;
    }
    Schema.SObjectType type = ImportFields.ofTerm(term);
    List<String> relationships = new List<String>();
    List<String> subqueries = new List<String>();
    for (Schema.SObjectField child : INSIDE.get(term)) {
      String relationship = ShoreshSchema.childRelationship(type, child);
      relationships.add(relationship);
      subqueries.add(
        '(SELECT Id FROM ' +
          relationship +
          ' WHERE Id NOT IN :createdIds LIMIT 1)'
      );
    }
    // Object and relationship names come from the platform, for the fields above.
    for (
      SObject record : Database.queryWithBinds(
        'SELECT Id, ' +
          String.join(subqueries, ', ') +
          ' FROM ' +
          ShoreshSchema.queryName(type) +
          ' WHERE Id IN :ids',
        new Map<String, Object>{ 'ids' => ids, 'createdIds' => createdIds },
        AccessLevel.USER_MODE
      )
    ) {
      for (String relationship : relationships) {
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
  private void deleteAll(String term, List<SObject> records) {
    List<Database.DeleteResult> outcomes = Database.delete(
      records,
      false,
      AccessLevel.USER_MODE
    );
    for (Integer i = 0; i < outcomes.size(); i++) {
      if (outcomes[i].isSuccess()) {
        result.removed += ImportUndoCount.each(term);
        continue;
      }
      Database.Error error = outcomes[i].getErrors()[0];
      if (error.getStatusCode() != StatusCode.DELETE_FAILED) {
        throw ImportUndo.refused(
          ImportFields.nameOf(records[i]),
          'couldn\'t remove it',
          error
        );
      }
      keep(records[i], result.keptInUse);
    }
  }
}
