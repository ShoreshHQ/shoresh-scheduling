/**
 * What a row save compares (RowSaves): the fields the director changed, the row as it is now
 * (locked until the save is done), and whether a value is still as the director saw it.
 */
public with sharing class RowSeen {
  /** The fields the director changed and saw, by the name the screen sent. */
  public static Map<String, Schema.SObjectField> comparedFields(
    SObject record,
    SObject seen
  ) {
    Map<String, Schema.SObjectField> result = new Map<String, Schema.SObjectField>();
    if (seen == null) {
      return result;
    }
    Schema.SObjectType kind = record.getSObjectType();
    if (seen.getSObjectType() != kind) {
      throw new ShoreshException('These screens can\'t save that.');
    }
    Set<String> sent = record.getPopulatedFieldsAsMap().keySet();
    for (String name : seen.getPopulatedFieldsAsMap().keySet()) {
      Schema.SObjectField field = ShoreshSchema.field(kind, name);
      if (name != 'Id' && field != null && sent.contains(name)) {
        result.put(name, field);
      }
    }
    return result;
  }

  /** The row as it is now, locked; refused in plain words when someone else deleted it. */
  public static SObject lockedNow(
    SObject record,
    List<Schema.SObjectField> fields,
    SObject seen
  ) {
    Set<String> columns = new Set<String>{ 'Id', 'Name' };
    for (Schema.SObjectField field : fields) {
      columns.add(ShoreshSchema.queryName(field));
    }
    List<SObject> found = Database.queryWithBinds(
      'SELECT ' +
        String.join(new List<String>(columns), ', ') +
        ' FROM ' +
        ShoreshSchema.queryName(record.getSObjectType()) +
        ' WHERE Id = :recordId FOR UPDATE',
      new Map<String, Object>{ 'recordId' => record.Id },
      AccessLevel.USER_MODE
    );
    if (found.isEmpty()) {
      throw new ShoreshException(goneMessage(nameOf(record, seen)));
    }
    return found[0];
  }

  private static Object nameOf(SObject record, SObject seen) {
    if (record.getPopulatedFieldsAsMap().containsKey('Name')) {
      return record.get('Name');
    }
    if (seen != null && seen.getPopulatedFieldsAsMap().containsKey('Name')) {
      return seen.get('Name');
    }
    return null;
  }

  private static String goneMessage(Object name) {
    return name == null
      ? 'This was deleted by someone else.'
      : '"' + name + '" was deleted by someone else.';
  }

  /** Who a recurring activity covers now (divisions and groups); nobody for other rows. */
  public static List<Id> whoNow(SObject record) {
    List<Id> result = new List<Id>();
    if (record.getSObjectType() != RecurringActivity__c.SObjectType) {
      return result;
    }
    for (Coverage__c row : [
      SELECT Division__c, Group__c
      FROM Coverage__c
      WHERE RecurringActivity__c = :record.Id
      WITH USER_MODE
      ORDER BY Id
    ]) {
      result.add(row.Division__c != null ? row.Division__c : row.Group__c);
    }
    return result;
  }

  public static Boolean sameIds(List<Id> a, List<Id> b) {
    return new Set<Id>(a).equals(new Set<Id>(b));
  }

  /** Unchanged since the director saw it, or someone else made the same change. */
  public static Boolean stillAsSeen(Object seen, Object now, Object wanted) {
    return same(seen, now) || same(wanted, now);
  }

  /** Equal values: blanks alike, text exactly (Apex == ignores capitals), numbers by value. */
  public static Boolean same(Object a, Object b) {
    Boolean blankA = a == null || (a instanceof String && a == '');
    Boolean blankB = b == null || (b instanceof String && b == '');
    if (blankA || blankB) {
      return blankA && blankB;
    }
    if (a instanceof Decimal && b instanceof Decimal) {
      return (Decimal) a == (Decimal) b;
    }
    if (a instanceof String && b instanceof String) {
      return ((String) a).equals((String) b);
    }
    return a == b;
  }
}
