/**
 * What an import changes, recorded before it is changed, so Undo last import can put it back:
 * for each existing record the import updates, the values of the fields it updates.
 */
public with sharing class ImportUndoLog {
  /** [{ id, type, before: { field: value } }] for the rows that update existing records. */
  public static List<Map<String, Object>> before(List<SObject> rows) {
    Map<Schema.SObjectType, Map<Id, Set<String>>> byType = new Map<Schema.SObjectType, Map<Id, Set<String>>>();
    for (SObject row : rows) {
      if (row.Id == null) {
        continue;
      }
      Set<String> fields = new Set<String>(
        row.getPopulatedFieldsAsMap().keySet()
      );
      fields.remove('Id');
      Schema.SObjectType kind = row.getSObjectType();
      if (!byType.containsKey(kind)) {
        byType.put(kind, new Map<Id, Set<String>>());
      }
      byType.get(kind).put(row.Id, fields);
    }
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Schema.SObjectType kind : byType.keySet()) {
      result.addAll(valuesBefore(kind, byType.get(kind)));
    }
    return result;
  }

  private static List<Map<String, Object>> valuesBefore(
    Schema.SObjectType kind,
    Map<Id, Set<String>> fieldsById
  ) {
    Set<String> all = new Set<String>();
    for (Set<String> fields : fieldsById.values()) {
      all.addAll(fields);
    }
    // Field names come from Shoresh's own rows, never from the screen.
    Set<Id> ids = fieldsById.keySet();
    List<SObject> saved = Database.queryWithBinds(
      'SELECT Id, ' +
        String.join(new List<String>(all), ', ') +
        ' FROM ' +
        kind.getDescribe().getName() +
        ' WHERE Id IN :ids',
      new Map<String, Object>{ 'ids' => ids },
      AccessLevel.USER_MODE
    );
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (SObject record : saved) {
      Map<String, Object> values = new Map<String, Object>();
      for (String field : fieldsById.get(record.Id)) {
        values.put(field, plain(record.get(field)));
      }
      result.add(
        new Map<String, Object>{
          'id' => record.Id,
          'type' => kind.getDescribe().getName(),
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
    for (String field : row.getPopulatedFieldsAsMap().keySet()) {
      if (field != 'Id') {
        result.put(field, plain(row.get(field)));
      }
    }
    return result;
  }

  /** How a value is kept and compared: times as "HH:mm", everything else as it is. */
  public static Object plain(Object value) {
    return value instanceof Time
      ? (Object) String.valueOf(value).left(5)
      : value;
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

  /** A short fingerprint of a record's values for the given fields (sorted). */
  public static String digest(SObject record, List<String> fields) {
    List<String> parts = new List<String>();
    for (String field : fields) {
      parts.add(field + '=' + normalized(record.get(field)));
    }
    return EncodingUtil.convertToHex(
        Crypto.generateDigest('MD5', Blob.valueOf(String.join(parts, '\n')))
      )
      .left(16);
  }

  /** A row's written fields, sorted, its Id left out. */
  public static List<String> fieldsOf(SObject row) {
    List<String> fields = new List<String>();
    for (String field : row.getPopulatedFieldsAsMap().keySet()) {
      if (field != 'Id') {
        fields.add(field);
      }
    }
    fields.sort();
    return fields;
  }
}
