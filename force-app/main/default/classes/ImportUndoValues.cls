/**
 * How the import log keeps and compares values, and putting back the values Undo last import
 * kept (ImportUndoLog).
 */
public with sharing class ImportUndoValues {
  /** Whether a value saved now is the one the import wrote. */
  public static Boolean same(Object now, Object written) {
    Object plainNow = plain(now);
    if (isNumber(plainNow) && isNumber(written)) {
      return Decimal.valueOf(String.valueOf(plainNow)) ==
        Decimal.valueOf(String.valueOf(written));
    }
    // Exactly, capitals too: Apex == on text ignores them, and a capitals-only edit is an edit.
    String a = String.valueOf(plainNow);
    String b = String.valueOf(written);
    return a == null ? b == null : a.equals(b);
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

  /**
   * The records with the given fields, their names and when each was last saved
   * (ImportProvenance, INGEST-5.7), in user mode. Only fields ImportFields lists are queried.
   */
  public static List<SObject> readSaved(
    Schema.SObjectType type,
    Set<String> fields,
    Set<Id> ids
  ) {
    ImportFields.check(type, fields);
    Set<String> columns = new Set<String>{ 'Name', 'LastModifiedDate' };
    for (String name : fields) {
      columns.add(ShoreshSchema.queryName(ImportFields.field(type, name)));
    }
    return Database.queryWithBinds(
      'SELECT Id, ' +
        String.join(new List<String>(columns), ', ') +
        ' FROM ' +
        ShoreshSchema.queryName(type) +
        ' WHERE Id IN :ids',
      new Map<String, Object>{ 'ids' => ids },
      AccessLevel.USER_MODE
    );
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
   * (read checks a log's): this never queries, but it trusts what it is given.
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
}
