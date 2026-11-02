/**
 * The import log, kept on each import's record (Import__c) and read back by Undo last import,
 * which restores the camp as it was (docs/import/review.md INGEST-5.10). ImportWriter records
 * it as an import (or Copy season) saves; reverse() puts it back, its steps run only from here.
 *
 * Created__c: what the import made, by kind (ImportWriter.created), each with a fingerprint of
 * what it wrote. Changed__c: a list of entries, each a record's values before and after
 * ({ id, type, name, before, after }), or one of the kinds below, marked by its key.
 *
 * What triggers do as an import saves needs no entry of its own. Values a trigger works out from
 * the row (keys, a time block's name that follows its times, a fixed or recurring activity's
 * last block) are worked out again when Undo puts the row back; a holding record of a group with
 * no division that went when its last group moved out is made again (NoDivisions.restoreHolders);
 * records that go with one deleted go with it. The rest of what triggers do only checks.
 *
 * Objects and fields are kept by their local names ("Week__c", "StartDate__c"): the same with or
 * without the package's namespace, so a log reads the same before and after it arrives. Rows
 * report their fields with the prefix once there is one; they are turned into fields first.
 */
public with sharing class ImportUndoLog {
  // Entries of Changed__c that are not a record's values, by the key that marks them: who lists
  // a list import replaced (slice 4c), weeks off a workbook ticked back on and camp words it set
  // back (part D), what a second import removed and the cells it took out (INGEST-5.8).
  public static final String WHO = 'who';
  public static final String WEEK_ON = 'weekOn';
  public static final String WORD_OFF = 'wordOff';
  public static final String REMOVED = 'removed';
  public static final String CELLS_OUT = 'cellsOut';
  private static final List<String> OWN_KINDS = new List<String>{
    WHO,
    WEEK_ON,
    WORD_OFF,
    REMOVED,
    CELLS_OUT
  };
  // Everything else in Changed__c: a record's values.
  private static final String RECORD_VALUES = 'values';

  /**
   * Puts back what the import did, in this order: what it removed comes back, then what it
   * changed goes back (a group moved into a division the import made goes home), then what it
   * made is removed. Anything edited since, or still in use, is kept and named in the result.
   */
  public static void reverse(Import__c done, ImportUndo.Result result) {
    Map<String, List<Object>> sorted = sorted(done);
    List<Object> changes = sorted.get(RECORD_VALUES);
    List<Object> wordsOff = sorted.get(WORD_OFF);
    Id campId = touchesCampWords(done, changes, wordsOff)
      ? campOf(done.Season__c)
      : null;
    if (campId != null) {
      // Camp words are shared by the camp's seasons: another season's import waits.
      ImportUndo.lockCamp(campId);
    }
    new ImportUndoRemovals(result).run(sorted.get(REMOVED));
    ImportSupersededCells.putBack(sorted.get(CELLS_OUT), result);
    new ImportUndoRestores(result).run(changes);
    new ImportUndoWho(result).run(sorted.get(WHO));
    new ImportUndoWeeksOff(result, done.Season__c).run(sorted.get(WEEK_ON));
    new ImportUndoWords(result, campId).run(wordsOff);
    // Last, what it made, its imported week too, which nothing else may delete.
    ImportedWeekGuard.allow();
    try {
      new ImportUndoDeletes(result, new ImportUndoLater(done))
        .run((Map<String, Object>) JSON.deserializeUntyped(done.Created__c));
    } finally {
      ImportedWeekGuard.done();
    }
  }

  /** What the import changed, by kind (RECORD_VALUES for records' values). */
  private static Map<String, List<Object>> sorted(Import__c done) {
    Map<String, List<Object>> byKind = new Map<String, List<Object>>{
      RECORD_VALUES => new List<Object>()
    };
    for (String kind : OWN_KINDS) {
      byKind.put(kind, new List<Object>());
    }
    for (
      Object entry : (List<Object>) JSON.deserializeUntyped(done.Changed__c)
    ) {
      // Anything that isn't an entry is the refusal.
      if (!(entry instanceof Map<String, Object>)) {
        throw ImportFields.unreadableLog();
      }
      Map<String, Object> logged = (Map<String, Object>) entry;
      String kind = RECORD_VALUES;
      for (String own : OWN_KINDS) {
        if (logged.containsKey(own)) {
          kind = own;
          break;
        }
      }
      byKind.get(kind).add(entry);
    }
    return byKind;
  }

  /** Whether Undo changes camp words: one the import added, changed, or set back. */
  private static Boolean touchesCampWords(
    Import__c done,
    List<Object> changes,
    List<Object> wordsOff
  ) {
    if (
      !wordsOff.isEmpty() ||
      ((Map<String, Object>) JSON.deserializeUntyped(done.Created__c))
        .containsKey('CampLabel')
    ) {
      return true;
    }
    for (Object entry : changes) {
      if (
        ImportFields.ofRecord(((Map<String, Object>) entry).get('id')) ==
        CampLabel__c.SObjectType
      ) {
        return true;
      }
    }
    return false;
  }

  private static Id campOf(Id seasonId) {
    return [SELECT Camp__c FROM Season__c WHERE Id = :seasonId WITH USER_MODE]
    .Camp__c;
  }

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
        values.put(name, ImportUndoValues.plain(record.get(fields.get(name))));
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
      if (reported != 'Id' && field != null) {
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
