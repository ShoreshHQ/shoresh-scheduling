/**
 * The attached records an import makes for an item (who can do it, who it covers, weeks off), for
 * ImportProvenance: an item whose attached records were added, changed or deleted by hand since
 * its import counts as changed (docs/import/review.md INGEST-5.7).
 */
public with sharing class ImportProvenanceAttached {
  // Attached records an import also makes: a hand change to one is a change to its item.
  private static final List<String> ATTACHED = new List<String>{
    'ActivityEligibility',
    'Coverage',
    'WeekException'
  };
  /** The attached records one import made, with when it was saved. */
  public static void read(
    Map<String, Object> created,
    Map<Id, Datetime> attached,
    Datetime at
  ) {
    for (String term : ATTACHED) {
      if (!created.containsKey(term)) {
        continue;
      }
      Schema.SObjectType type = ImportFields.ofTerm(term);
      for (
        Object row : (List<Object>) ((Map<String, Object>) created.get(term))
          .get('rows')
      ) {
        Object recordId = ((List<Object>) row)[0];
        if (ImportFields.ofRecord(recordId) != type) {
          throw ImportFields.unreadableLog();
        }
        attached.put((Id) (String) recordId, at);
      }
    }
  }

  /**
   * Items with an attached record added by hand, saved since its import, or deleted since.
   * attached: each attached record an import made, and when that import was saved.
   */
  public static Set<Id> changed(Set<Id> ids, Map<Id, Datetime> attached) {
    Set<Id> result = new Set<Id>();
    if (ids.isEmpty()) {
      return result;
    }
    List<SObject> rows = new List<SObject>();
    rows.addAll(
      [
        SELECT Id, Activity__c, LastModifiedDate
        FROM ActivityEligibility__c
        WHERE Activity__c IN :ids
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT Id, RecurringActivity__c, LastModifiedDate
        FROM Coverage__c
        WHERE RecurringActivity__c IN :ids
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT
          Id,
          Activity__c,
          FixedActivity__c,
          RecurringActivity__c,
          LastModifiedDate
        FROM WeekException__c
        WHERE
          Activity__c IN :ids
          OR FixedActivity__c IN :ids
          OR RecurringActivity__c IN :ids
        WITH USER_MODE
      ]
    );
    for (SObject row : rows) {
      Datetime madeAt = attached.get(row.Id);
      if (madeAt == null || ((Datetime) row.get('LastModifiedDate')) > madeAt) {
        result.addAll(ownersOf(row, ids));
      }
    }
    result.addAll(deletedAttached(ids, attached.keySet()));
    return result;
  }

  /**
   * Items whose attached records an import made were deleted since (in the Recycle Bin). Read in
   * system mode: deleted rows can only be read that way, and only the parent of rows the
   * import itself logged is read, to keep this import from changing the item.
   */
  private static Set<Id> deletedAttached(Set<Id> ids, Set<Id> made) {
    Set<Id> result = new Set<Id>();
    if (made.isEmpty()) {
      return result;
    }
    List<SObject> rows = new List<SObject>();
    rows.addAll(
      [
        SELECT Id, Activity__c
        FROM ActivityEligibility__c
        WHERE Id IN :made AND IsDeleted = TRUE
        WITH SYSTEM_MODE
        ALL ROWS
      ]
    );
    rows.addAll(
      [
        SELECT Id, RecurringActivity__c
        FROM Coverage__c
        WHERE Id IN :made AND IsDeleted = TRUE
        WITH SYSTEM_MODE
        ALL ROWS
      ]
    );
    rows.addAll(
      [
        SELECT Id, Activity__c, FixedActivity__c, RecurringActivity__c
        FROM WeekException__c
        WHERE Id IN :made AND IsDeleted = TRUE
        WITH SYSTEM_MODE
        ALL ROWS
      ]
    );
    for (SObject row : rows) {
      result.addAll(ownersOf(row, ids));
    }
    return result;
  }

  /** The items among ids an attached row belongs to. */
  private static Set<Id> ownersOf(SObject row, Set<Id> ids) {
    List<Id> owners = new List<Id>();
    if (row instanceof ActivityEligibility__c) {
      owners.add(((ActivityEligibility__c) row).Activity__c);
    } else if (row instanceof Coverage__c) {
      owners.add(((Coverage__c) row).RecurringActivity__c);
    } else {
      WeekException__c off = (WeekException__c) row;
      owners.addAll(
        new List<Id>{
          off.Activity__c,
          off.FixedActivity__c,
          off.RecurringActivity__c
        }
      );
    }
    Set<Id> result = new Set<Id>();
    for (Id owner : owners) {
      if (owner != null && ids.contains(owner)) {
        result.add(owner);
      }
    }
    return result;
  }
}
