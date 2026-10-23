/**
 * What an import changes, recorded before it is changed, so Undo last import can put it back:
 * for each existing record the import updates, the values of the fields it updates.
 *
 * Objects and fields are kept by their local names ("Week__c", "StartDate__c"): the same with or
 * without the package's namespace, so a log reads the same before and after it arrives. Rows
 * report their fields with the prefix once there is one; they are turned into fields first.
 */
public with sharing class ImportUndoLog {
  /** [{ id, type, name, before: { field: value } }] for the rows that update existing records. */
  public static List<Map<String, Object>> before(List<SObject> rows) {
    Map<Schema.SObjectType, Map<Id, Map<String, Schema.SObjectField>>> byType = new Map<Schema.SObjectType, Map<Id, Map<String, Schema.SObjectField>>>();
    for (SObject row : rows) {
      if (row.Id == null) {
        continue;
      }
      Schema.SObjectType kind = row.getSObjectType();
      if (!byType.containsKey(kind)) {
        byType.put(kind, new Map<Id, Map<String, Schema.SObjectField>>());
      }
      byType.get(kind).put(row.Id, written(row));
    }
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Schema.SObjectType kind : byType.keySet()) {
      result.addAll(valuesBefore(kind, byType.get(kind)));
    }
    return result;
  }

  private static List<Map<String, Object>> valuesBefore(
    Schema.SObjectType kind,
    Map<Id, Map<String, Schema.SObjectField>> fieldsById
  ) {
    // Name too, so Undo can say which record was deleted since.
    Set<String> columns = new Set<String>{ 'Name' };
    // An offering by its activity's (its own name is a number).
    if (kind == Offering__c.SObjectType) {
      columns.add(ImportFields.offeringNameColumn());
    }
    for (Map<String, Schema.SObjectField> fields : fieldsById.values()) {
      for (Schema.SObjectField field : fields.values()) {
        columns.add(ShoreshSchema.queryName(field));
      }
    }
    // Fields come from Shoresh's own rows, never from the screen.
    Set<Id> ids = fieldsById.keySet();
    List<SObject> saved = Database.queryWithBinds(
      'SELECT Id, ' +
        String.join(new List<String>(columns), ', ') +
        ' FROM ' +
        ShoreshSchema.queryName(kind) +
        ' WHERE Id IN :ids',
      new Map<String, Object>{ 'ids' => ids },
      AccessLevel.USER_MODE
    );
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (SObject record : saved) {
      Map<String, Object> values = new Map<String, Object>();
      Map<String, Schema.SObjectField> fields = fieldsById.get(record.Id);
      for (String name : fields.keySet()) {
        values.put(name, plain(record.get(fields.get(name))));
      }
      result.add(
        new Map<String, Object>{
          'id' => record.Id,
          'type' => ShoreshSchema.localName(kind),
          'name' => kind == Offering__c.SObjectType
            ? ImportFields.nameOf(record)
            : record.get('Name'),
          'before' => values
        }
      );
    }
    return result;
  }

  /** The same records' values as written, beside the values before. */
  public static List<Map<String, Object>> withAfter(
    List<Map<String, Object>> before,
    List<SObject> rows
  ) {
    Map<Id, SObject> byId = new Map<Id, SObject>();
    for (SObject row : rows) {
      if (row.Id != null) {
        byId.put(row.Id, row);
      }
    }
    for (Map<String, Object> entry : before) {
      entry.put('after', values(byId.get((Id) entry.get('id'))));
    }
    return before;
  }

  /** A row's written fields as plain values (times as "HH:mm"), its Id left out. */
  public static Map<String, Object> values(SObject row) {
    Map<String, Object> result = new Map<String, Object>();
    Map<String, Schema.SObjectField> fields = written(row);
    for (String name : fields.keySet()) {
      result.put(name, plain(row.get(fields.get(name))));
    }
    return result;
  }

  /**
   * The fields a row was given, by local name, its Id left out. Every one is a field of the row's
   * object (it reported it), so none is ever missing.
   */
  public static Map<String, Schema.SObjectField> written(SObject row) {
    Schema.SObjectType kind = row.getSObjectType();
    Map<String, Schema.SObjectField> result = new Map<String, Schema.SObjectField>();
    for (String reported : row.getPopulatedFieldsAsMap().keySet()) {
      Schema.SObjectField field = ShoreshSchema.field(kind, reported);
      if (reported != 'Id' && field != null) {
        result.put(ShoreshSchema.localName(field), field);
      }
    }
    return result;
  }

  /** How a value is kept and compared: times as "HH:mm", dates as "yyyy-MM-dd", else as is. */
  public static Object plain(Object value) {
    if (value instanceof Time) {
      return String.valueOf(value).left(5);
    }
    if (value instanceof Date) {
      return String.valueOf(value).left(10);
    }
    return value;
  }

  /** One text for comparing values: numbers without trailing zeros, times as "HH:mm". */
  public static String normalized(Object value) {
    Object plainValue = plain(value);
    if (plainValue == null) {
      return '';
    }
    if (
      plainValue instanceof Decimal ||
      plainValue instanceof Integer ||
      plainValue instanceof Long ||
      plainValue instanceof Double
    ) {
      return Decimal.valueOf(String.valueOf(plainValue))
        .stripTrailingZeros()
        .toPlainString();
    }
    return String.valueOf(plainValue);
  }

  /**
   * A short fingerprint of a record's values for the given fields (sorted). Fields are named by
   * their local names in it, however the list spells them, so a fingerprint taken before the
   * namespace arrived still matches. The names must be Shoresh's own or already checked
   * (ImportUndoValues.read checks a log's): this never queries, but it trusts what it is given.
   */
  public static String digest(SObject record, List<String> fields) {
    Schema.SObjectType kind = record.getSObjectType();
    List<String> parts = new List<String>();
    for (String name : fields) {
      Schema.SObjectField field = ShoreshSchema.field(kind, name);
      if (field == null) {
        throw ImportFields.unreadableLog();
      }
      parts.add(
        ShoreshSchema.localName(field) + '=' + normalized(record.get(field))
      );
    }
    return EncodingUtil.convertToHex(
        Crypto.generateDigest('MD5', Blob.valueOf(String.join(parts, '\n')))
      )
      .left(16);
  }

  /** A row's written fields by local name, sorted, its Id left out. */
  public static List<String> fieldsOf(SObject row) {
    List<String> fields = new List<String>(written(row).keySet());
    fields.sort();
    return fields;
  }
}
