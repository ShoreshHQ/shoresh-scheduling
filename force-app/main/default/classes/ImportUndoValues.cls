/** Comparing and putting back the values Undo last import kept (ImportUndoLog). */
public with sharing class ImportUndoValues {
  /** Whether a value saved now is the one the import wrote. */
  public static Boolean same(Object now, Object written) {
    Object plainNow = ImportUndoLog.plain(now);
    if (isNumber(plainNow) && isNumber(written)) {
      return Decimal.valueOf(String.valueOf(plainNow)) ==
        Decimal.valueOf(String.valueOf(written));
    }
    return String.valueOf(plainNow) == String.valueOf(written);
  }

  private static Boolean isNumber(Object value) {
    return value instanceof Decimal ||
      value instanceof Integer ||
      value instanceof Long ||
      value instanceof Double;
  }

  /** Whether every field the import wrote still holds what it wrote. */
  public static Boolean unchanged(SObject record, Map<String, Object> written) {
    for (String field : written.keySet()) {
      if (!same(record.get(field), written.get(field))) {
        return false;
      }
    }
    return true;
  }

  /** A kept value as the field takes it: "09:00" back to a time. */
  public static Object asField(
    Schema.SObjectType kind,
    String field,
    Object value
  ) {
    Schema.DisplayType type = kind.getDescribe()
      .fields.getMap()
      .get(field)
      .getDescribe()
      .getType();
    if (type == Schema.DisplayType.TIME && value != null) {
      List<String> parts = String.valueOf(value).split(':');
      return Time.newInstance(
        Integer.valueOf(parts[0]),
        Integer.valueOf(parts[1]),
        0,
        0
      );
    }
    if (type == Schema.DisplayType.DOUBLE && value != null) {
      return Decimal.valueOf(String.valueOf(value));
    }
    return value;
  }

  /** The records, with the given fields and their names, in user mode. */
  public static Map<Id, SObject> read(
    String objectName,
    Set<String> fields,
    Set<Id> ids
  ) {
    Set<String> wanted = new Set<String>(fields);
    wanted.add('Name');
    wanted.remove('Id');
    // Field and object names come from Shoresh's own records, never from the screen.
    return new Map<Id, SObject>(
      Database.queryWithBinds(
        'SELECT Id, ' +
          String.join(new List<String>(wanted), ', ') +
          ' FROM ' +
          objectName +
          ' WHERE Id IN :ids',
        new Map<String, Object>{ 'ids' => ids },
        AccessLevel.USER_MODE
      )
    );
  }
}
