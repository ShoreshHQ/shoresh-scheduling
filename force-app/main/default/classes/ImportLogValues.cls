/**
 * A record's values in the import log (ImportLogEntries.Values), as an import writes them: what an
 * update's fields held before it saves, then what it wrote; and the fields a row was given, which
 * the log also fingerprints what an import created by (ImportWriter.created).
 */
public with sharing class ImportLogValues {
  // Reported by a record but never written by an import: IsDeleted comes with a record's defaults.
  private static final Set<String> NOT_WRITTEN = new Set<String>{
    'Id',
    'IsDeleted'
  };

  /** The values before of the rows that update existing records (their "after" comes later). */
  public static List<ImportLogEntries.Values> before(List<SObject> rows) {
    Map<Schema.SObjectType, Map<Id, Map<String, Schema.SObjectField>>> byType = new Map<Schema.SObjectType, Map<Id, Map<String, Schema.SObjectField>>>();
    for (SObject row : rows) {
      if (row.Id == null) {
        continue;
      }
      Schema.SObjectType kind = row.getSObjectType();
      if (!byType.containsKey(kind)) {
        byType.put(kind, new Map<Id, Map<String, Schema.SObjectField>>());
      }
      byType.get(kind)
        .put(row.Id, SetTimePlan.withLastBlock(written(row), kind));
    }
    List<ImportLogEntries.Values> result = new List<ImportLogEntries.Values>();
    for (Schema.SObjectType kind : byType.keySet()) {
      result.addAll(valuesBefore(kind, byType.get(kind)));
    }
    return result;
  }

  private static List<ImportLogEntries.Values> valuesBefore(
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
    List<ImportLogEntries.Values> result = new List<ImportLogEntries.Values>();
    for (SObject record : saved) {
      Map<String, Object> kept = new Map<String, Object>();
      Map<String, Schema.SObjectField> fields = fieldsById.get(record.Id);
      for (String name : fields.keySet()) {
        kept.put(name, ImportUndoValues.plain(record.get(fields.get(name))));
      }
      result.add(new ImportLogEntries.Values(record, kept));
    }
    return result;
  }

  /** The same records' values as written, beside the values before. */
  public static List<ImportLogEntries.Values> withAfter(
    List<ImportLogEntries.Values> before,
    List<SObject> rows
  ) {
    Map<Id, SObject> byId = new Map<Id, SObject>();
    for (SObject row : rows) {
      if (row.Id != null) {
        byId.put(row.Id, row);
      }
    }
    for (ImportLogEntries.Values entry : before) {
      entry.setAfter(writtenValues(byId.get(entry.recordId())));
    }
    return before;
  }

  /** A row's written fields as plain values (times as "HH:mm"), its Id left out. */
  private static Map<String, Object> writtenValues(SObject row) {
    Map<String, Object> result = new Map<String, Object>();
    Map<String, Schema.SObjectField> fields = written(row);
    for (String name : fields.keySet()) {
      result.put(name, ImportUndoValues.plain(row.get(fields.get(name))));
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
      if (!NOT_WRITTEN.contains(reported) && field != null) {
        result.put(ShoreshSchema.localName(field), field);
      }
    }
    return result;
  }

  /** A row's written fields by local name, sorted, its Id left out. */
  public static List<String> fieldsOf(SObject row) {
    List<String> fields = new List<String>(written(row).keySet());
    fields.sort();
    return fields;
  }
}
