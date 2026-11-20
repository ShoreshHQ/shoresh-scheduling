/**
 * The import log's entries (Import__c.Changed__c): how an import records each thing it changed,
 * and how Undo last import (ImportUndoLog) and a second import (ImportProvenance) read it back
 * (docs/import/review.md INGEST-5.10). Changed__c is a list of entries, each a record's values
 * before and after ({ id, type, name, before, after }), or one of the kinds below, marked by its
 * key. The stored shape never changes: logs already saved must still undo (ImportLogEntriesTest).
 * A record's values are read from the record as an import saves it by ImportLogValues.
 *
 * Objects and fields are kept by their local names ("Week__c", "StartDate__c"): the same with or
 * without the package's namespace, so a log reads the same before and after it arrives. Rows
 * report their fields with the prefix once there is one; they are turned into fields first.
 *
 * An import's record is text that could be edited, so what Undo reads is checked as it is read:
 * anything an import doesn't write is the refusal (ImportFields.unreadableLog).
 */
public with sharing class ImportLogEntries {
  // The keys that mark the entries that are not a record's values: who lists a list import
  // replaced (slice 4c), weeks off a workbook ticked back on and camp words it set back (part D),
  // what a second import removed and the cells it took out (INGEST-5.8).
  private static final String WHO = 'who';
  private static final String WEEK_ON = 'weekOn';
  private static final String WORD_OFF = 'wordOff';
  private static final String REMOVED = 'removed';
  private static final String CELLS_OUT = 'cellsOut';

  /** What an import changed, read back by kind, each in the order logged. */
  public class Changes {
    public List<Values> recordValues = new List<Values>();
    public List<Who> whoLists = new List<Who>();
    public List<WeekOn> weeksOn = new List<WeekOn>();
    public List<WordOff> wordsOff = new List<WordOff>();
    public List<Removed> removals = new List<Removed>();
    public List<CellsOut> cellsTakenOut = new List<CellsOut>();
    /** Something in the log that isn't an entry at all: Undo refuses such a log. */
    public Boolean unreadable = false;

    private void file(Map<String, Object> logged) {
      if (logged.containsKey(ImportLogEntries.WHO)) {
        whoLists.add(new Who(logged));
        return;
      }
      if (logged.containsKey(ImportLogEntries.WEEK_ON)) {
        weeksOn.add(new WeekOn(logged));
        return;
      }
      if (logged.containsKey(ImportLogEntries.WORD_OFF)) {
        wordsOff.add(new WordOff(logged));
        return;
      }
      if (logged.containsKey(ImportLogEntries.REMOVED)) {
        removals.add(new Removed(logged));
        return;
      }
      if (logged.containsKey(ImportLogEntries.CELLS_OUT)) {
        cellsTakenOut.add(new CellsOut(logged));
        return;
      }
      recordValues.add(new Values(logged));
    }
  }

  /** An import's Changed__c, read back by kind. */
  public static Changes read(String changed) {
    Changes result = new Changes();
    for (Object item : (List<Object>) JSON.deserializeUntyped(changed)) {
      if (item instanceof Map<String, Object>) {
        result.file((Map<String, Object>) item);
      } else {
        result.unreadable = true;
      }
    }
    return result;
  }

  /** One entry, kept as it is stored. */
  public abstract class Entry {
    protected Map<String, Object> logged;

    /** The entry as Changed__c keeps it. */
    public Map<String, Object> toLog() {
      return logged;
    }

    /** The record it names: an import's (as written), or text from the log (as read). */
    protected Id idAt(String key) {
      return (Id) (String) logged.get(key);
    }

    public String name() {
      return (String) logged.get('name');
    }
  }

  /** A record's values: { id, type, name, before: { field: value }, after: { field: value } }. */
  public class Values extends Entry {
    private Values(Map<String, Object> logged) {
      this.logged = logged;
    }

    /** As an import logs it: the record as it was (an offering named by its activity). */
    public Values(SObject record, Map<String, Object> before) {
      this(
        new Map<String, Object>{
          'id' => record.Id,
          'type' => ShoreshSchema.localName(record.getSObjectType()),
          'name' => record.getSObjectType() == Offering__c.SObjectType
            ? ImportFields.nameOf(record)
            : record.get('Name'),
          'before' => before
        }
      );
    }

    /** The record's object, or the refusal: only objects imports write. */
    public Schema.SObjectType kind() {
      return ImportFields.ofRecord(logged.get('id'));
    }

    public Id recordId() {
      return idAt('id');
    }

    /** The record, read leniently (another import's log): none unless it names one. */
    public Id namedId() {
      Object value = logged.get('id');
      return value instanceof String && String.isNotBlank((String) value)
        ? (Id) (String) value
        : null;
    }

    public Map<String, Object> before() {
      return (Map<String, Object>) logged.get('before');
    }

    public Map<String, Object> after() {
      return (Map<String, Object>) logged.get('after');
    }

    public void setAfter(Map<String, Object> after) {
      logged.put('after', after);
    }

    /** A later write to the same record: the first "before" stays, the last "after" wins. */
    public void addLater(Values later) {
      Map<String, Object> before = before();
      Map<String, Object> laterBefore = later.before();
      for (String field : laterBefore.keySet()) {
        if (!before.containsKey(field)) {
          before.put(field, laterBefore.get(field));
        }
      }
      after().putAll(later.after());
    }
  }

  /**
   * A who list a list import replaced (slice 4c): { who: owner id, type (the rows' object), name,
   * before: [target ids], after: [target ids] }.
   */
  public class Who extends Entry {
    private Who(Map<String, Object> logged) {
      this.logged = logged;
    }

    /** As an import logs it, its lists given next (lists). */
    public Who(SObject owner, String type) {
      this(
        new Map<String, Object>{
          ImportLogEntries.WHO => owner.Id,
          'type' => type,
          'name' => owner.get('Name')
        }
      );
    }

    public Who lists(List<String> before, List<String> after) {
      logged.put('before', before);
      logged.put('after', after);
      return this;
    }

    public Id ownerId() {
      return idAt(ImportLogEntries.WHO);
    }

    /**
     * The kind of who list, checked against its owner and name: anything else (another object, an
     * owner of the other kind) is the refusal.
     */
    public ImportWhoKinds.Kind kind() {
      ImportWhoKinds.Kind kind = ImportWhoKinds.forChild(logged.get('type'));
      if (
        ImportFields.ofRecord(logged.get(ImportLogEntries.WHO)) !=
        kind.ownerObject || !(logged.get('name') instanceof String)
      ) {
        throw ImportFields.unreadableLog();
      }
      return kind;
    }

    /** The divisions and groups before, sorted, or the refusal. */
    public List<Id> before() {
      List<Id> result = new List<Id>();
      for (String target : ImportLogEntries.texts(logged.get('before'))) {
        Schema.SObjectType type = ImportFields.ofRecord(target);
        if (type != Division__c.SObjectType && type != Group__c.SObjectType) {
          throw ImportFields.unreadableLog();
        }
        result.add((Id) target);
      }
      return result;
    }

    /** The targets the import wrote, sorted, or the refusal. */
    public List<String> after() {
      return ImportLogEntries.texts(logged.get('after'));
    }
  }

  /**
   * A week an item was off that a workbook ticked back on (part D): { weekOn, week, field,
   * target, name (the week's), item (the item's name) }.
   */
  public class WeekOn extends Entry {
    private WeekOn(Map<String, Object> logged) {
      this.logged = logged;
    }

    /** As an import logs it: the week off, read with its week's and item's names. */
    public WeekOn(WeekException__c off, Schema.SObjectField field) {
      this(
        new Map<String, Object>{
          ImportLogEntries.WEEK_ON => off.Id,
          'week' => off.Week__c,
          'field' => ShoreshSchema.localName(field),
          'target' => off.get(field),
          'name' => off.Week__r.Name,
          'item' => off.getSObject(field).get('Name')
        }
      );
    }

    /** The week off to put back, every name and Id checked against what an import writes. */
    public WeekException__c weekOff() {
      Schema.SObjectField field = ImportFields.field(
        WeekException__c.SObjectType,
        logged.get('field')
      );
      if (
        field == WeekException__c.Week__c ||
        ImportFields.ofRecord(logged.get('week')) != Week__c.SObjectType
      ) {
        throw ImportFields.unreadableLog();
      }
      // Checked before it is read as an Id, so text that isn't one is refused the same way.
      if (
        ImportFields.ofRecord(logged.get('target')) !=
        field.getDescribe().getReferenceTo()[0]
      ) {
        throw ImportFields.unreadableLog();
      }
      WeekException__c off = new WeekException__c(Week__c = idAt('week'));
      off.put(field, idAt('target'));
      return off;
    }

    /** Named by its item and week: "Swim (Week 2)". */
    public String label() {
      return text('item') + ' (' + text('name') + ')';
    }

    private String text(String key) {
      Object value = logged.get(key);
      if (!(value instanceof String) || String.isBlank((String) value)) {
        throw ImportFields.unreadableLog();
      }
      return (String) value;
    }
  }

  /** A camp word a workbook set back to Shoresh's own (part D): { wordOff, term, singular, plural }. */
  public class WordOff extends Entry {
    private WordOff(Map<String, Object> logged) {
      this.logged = logged;
    }

    public WordOff(CampLabel__c label) {
      this(
        new Map<String, Object>{
          ImportLogEntries.WORD_OFF => label.Id,
          'term' => label.ModelTerm__c,
          'singular' => label.Singular__c,
          'plural' => label.Plural__c
        }
      );
    }

    /** The camp's word to put back, every value checked (terms: the model terms), or the refusal. */
    public CampLabel__c label(Id campId, Set<String> terms) {
      if (
        ImportFields.ofRecord(logged.get(ImportLogEntries.WORD_OFF)) !=
        CampLabel__c.SObjectType || !terms.contains(word('term'))
      ) {
        throw ImportFields.unreadableLog();
      }
      return new CampLabel__c(
        Camp__c = campId,
        ModelTerm__c = word('term'),
        Singular__c = word('singular'),
        Plural__c = word('plural')
      );
    }

    private String word(String key) {
      Object value = logged.get(key);
      if (
        !(value instanceof String) ||
        String.isBlank((String) value) ||
        ((String) value).length() > 80
      ) {
        throw ImportFields.unreadableLog();
      }
      return (String) value;
    }
  }

  /** A record an earlier import brought in that this one removed (INGEST-5.8): { removed, type, name }. */
  public class Removed extends Entry {
    private Removed(Map<String, Object> logged) {
      this.logged = logged;
    }

    public Removed(SObject record) {
      this(
        new Map<String, Object>{
          ImportLogEntries.REMOVED => record.Id,
          'type' => ShoreshSchema.localName(record.getSObjectType()),
          'name' => record.get('Name')
        }
      );
    }

    public Id recordId() {
      return idAt(ImportLogEntries.REMOVED);
    }

    /** The record to bring back, or the refusal: only objects imports write. */
    public SObject row() {
      return ImportFields.ofRecord(logged.get(ImportLogEntries.REMOVED))
        .newSObject(recordId());
    }
  }

  /**
   * An earlier imported week's day this import took a removed item's cells out of (INGEST-5.8):
   * { cellsOut, name, before, after }, its grid before and after.
   */
  public class CellsOut extends Entry {
    private CellsOut(Map<String, Object> logged) {
      this.logged = logged;
    }

    /** As an import logs it: the day read with its grid and its version's name. */
    public CellsOut(ScheduleDay__c day, String after) {
      this(
        new Map<String, Object>{
          ImportLogEntries.CELLS_OUT => day.Id,
          'name' => day.Schedule__r.Name,
          'before' => day.Grid__c,
          'after' => after
        }
      );
    }

    public Id dayId() {
      return idAt(ImportLogEntries.CELLS_OUT);
    }

    public String before() {
      return (String) logged.get('before');
    }

    public String after() {
      return (String) logged.get('after');
    }
  }

  /** A list of texts from the log, sorted, or the refusal. */
  private static List<String> texts(Object values) {
    if (!(values instanceof List<Object>)) {
      throw ImportFields.unreadableLog();
    }
    List<String> result = new List<String>();
    for (Object value : (List<Object>) values) {
      if (!(value instanceof String)) {
        throw ImportFields.unreadableLog();
      }
      result.add((String) value);
    }
    result.sort();
    return result;
  }
}
