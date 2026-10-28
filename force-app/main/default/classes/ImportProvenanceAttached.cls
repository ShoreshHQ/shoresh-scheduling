/**
 * The attached records an import makes for an item (who can do it, who it covers, weeks off), for
 * ImportProvenance: an item whose attached records were added, changed or deleted by hand since
 * its import counts as changed (docs/import/review.md INGEST-5.7).
 */
public with sharing class ImportProvenanceAttached {
  // Attached records an import also makes: a hand change to one is a change to its item.
  private static final List<String> ATTACHED_TERMS = new List<String>{
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
    for (String term : ATTACHED_TERMS) {
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
    rows.addAll(deletedRows(ActivityEligibility__c.Activity__c, made));
    rows.addAll(deletedRows(Coverage__c.RecurringActivity__c, made));
    rows.addAll(deletedRows(WeekException__c.Activity__c, made));
    rows.addAll(deletedRows(WeekException__c.FixedActivity__c, made));
    rows.addAll(deletedRows(WeekException__c.RecurringActivity__c, made));
    for (SObject row : rows) {
      result.addAll(ownersOf(row, ids));
    }
    return result;
  }

  /**
   * The deleted rows among made, with the item they belonged to by one field (ALL ROWS reads the
   * Recycle Bin, which only system mode allows; names come from the fields above).
   */
  private static List<SObject> deletedRows(
    Schema.SObjectField owner,
    Set<Id> made
  ) {
    String objectName = ShoreshSchema.queryName(ownerObject(owner));
    return Database.queryWithBinds(
      'SELECT Id, ' +
        ShoreshSchema.queryName(owner) +
        ' FROM ' +
        objectName +
        ' WHERE Id IN :made AND IsDeleted = TRUE ALL ROWS',
      new Map<String, Object>{ 'made' => made },
      AccessLevel.SYSTEM_MODE
    );
  }

  private static Schema.SObjectType ownerObject(Schema.SObjectField owner) {
    if (owner == ActivityEligibility__c.Activity__c) {
      return ActivityEligibility__c.SObjectType;
    }
    return owner == Coverage__c.RecurringActivity__c
      ? Coverage__c.SObjectType
      : WeekException__c.SObjectType;
  }

  /** The items among ids an attached row belongs to (by whichever owner fields it was read with). */
  private static Set<Id> ownersOf(SObject row, Set<Id> ids) {
    Set<Id> result = new Set<Id>();
    for (Object value : row.getPopulatedFieldsAsMap().values()) {
      if (value instanceof Id && ids.contains((Id) value)) {
        result.add((Id) value);
      }
    }
    return result;
  }
}
