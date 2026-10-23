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

  /** Whether every field the import wrote still holds what it wrote (names from the log). */
  public static Boolean unchanged(SObject record, Map<String, Object> written) {
    Schema.SObjectType kind = record.getSObjectType();
    for (String name : written.keySet()) {
      if (
        !same(record.get(ImportFields.field(kind, name)), written.get(name))
      ) {
        return false;
      }
    }
    return true;
  }

  /** A kept value as the field takes it: "09:00" back to a time. */
  public static Object asField(Schema.SObjectField field, Object value) {
    Schema.DisplayType type = field.getDescribe().getType();
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
    if (type == Schema.DisplayType.DATE && value != null) {
      return Date.valueOf(String.valueOf(value));
    }
    return value;
  }

  /**
   * The records, with the given fields and their names, in user mode. The names come from an
   * import's record, so only fields ImportFields lists are ever put into the query.
   */
  public static Map<Id, SObject> read(
    Schema.SObjectType type,
    Set<String> fields,
    Set<Id> ids
  ) {
    Set<String> columns = new Set<String>{ 'Name' };
    for (String name : fields) {
      if (name != 'Id') {
        columns.add(ShoreshSchema.queryName(ImportFields.field(type, name)));
      }
    }
    // A camp word is named by the word itself, an offering by its activity.
    if (type == CampLabel__c.SObjectType) {
      columns.add(ShoreshSchema.queryName(CampLabel__c.Singular__c));
    }
    if (type == Offering__c.SObjectType) {
      columns.add(ImportFields.offeringNameColumn());
    }
    return new Map<Id, SObject>(
      Database.queryWithBinds(
        'SELECT Id, ' +
          String.join(new List<String>(columns), ', ') +
          ' FROM ' +
          ShoreshSchema.queryName(type) +
          ' WHERE Id IN :ids',
        new Map<String, Object>{ 'ids' => ids },
        AccessLevel.USER_MODE
      )
    );
  }
}
