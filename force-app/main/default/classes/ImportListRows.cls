/**
 * The rows of a setup list's save (slice 4c, ImportListSaves): what a list may write for each
 * kind, and each record built from the screen's entry. Only the fields listed here are written;
 * a list never renames anything, and only adds the kinds it cannot change.
 */
public with sharing class ImportListRows {
  // Kinds that are children of the season itself (the others are inside a program).
  private static final Set<String> IN_SEASON = new Set<String>{
    'LocationType',
    'Location',
    'Activity'
  };
  // What a list may write, per kind: plain fields...
  private static final Map<String, Set<String>> PLAIN_FIELDS = new Map<String, Set<String>>{
    'LocationType' => new Set<String>{ 'Name' },
    'Location' => new Set<String>{ 'Name', 'GroupsThatFit__c', 'Notes__c' },
    'Division' => new Set<String>{ 'Name' },
    'Group' => new Set<String>{ 'Name', 'Availability__c' },
    'Activity' => new Set<String>{
      'Name',
      'Length__c',
      'TimesPerWeekMin__c',
      'TimesPerWeekMax__c',
      'NoWeeklyMax__c',
      'Priority__c',
      'Outdoor__c',
      'GroupsAtOnce__c',
      'NoGroupLimit__c',
      'SameDivisionOnly__c',
      'EarlyWeekCount__c',
      'EarlyWeekByDay__c',
      'Notes__c'
    }
  };
  // ...and fields naming another record.
  private static final Map<String, Set<String>> LINK_FIELDS = new Map<String, Set<String>>{
    'LocationType' => new Set<String>(),
    'Location' => new Set<String>{ 'LocationType__c' },
    'Division' => new Set<String>{ 'Program__c' },
    'Group' => new Set<String>{ 'Division__c' },
    'Activity' => new Set<String>{ 'Location__c', 'RainPlan__c' }
  };
  // Kinds a list can change once set up; the others it only adds (part A).
  private static final Set<String> CHANGEABLE = new Set<String>{
    'Location',
    'Activity'
  };
  private Id seasonId;
  private ImportKeys keys;
  private String kind;
  private Schema.SObjectType type;

  public ImportListRows(Id seasonId, ImportKeys keys, String kind) {
    this.seasonId = seasonId;
    this.keys = keys;
    this.kind = kind;
    this.type = Schema.getGlobalDescribe().get(kind + '__c');
  }

  /** Whether a list can write this kind at all. */
  public static Boolean isKind(String kind) {
    return PLAIN_FIELDS.containsKey(kind);
  }

  /** A new record (in the season, where its kind is) or an existing one, with its plain fields. */
  public SObject rowFor(ImportPlan.Entry entry) {
    SObject row = entry.isNew() ? newRow() : existingRow(entry.id());
    Map<String, Object> values = entry.valuesOf('fields');
    for (String field : values.keySet()) {
      // A list never renames anything (names are how rows find what is set up).
      Boolean renaming = field == 'Name' && !entry.isNew();
      if (!PLAIN_FIELDS.get(kind).contains(field) || renaming) {
        throw ImportListSaves.unreadable();
      }
      row.put(field, ImportUndoValues.asField(type, field, values.get(field)));
    }
    return row;
  }

  private SObject newRow() {
    SObject row = type.newSObject();
    if (IN_SEASON.contains(kind)) {
      row.put('Season__c', seasonId);
    }
    return row;
  }

  private SObject existingRow(Id recordId) {
    // Only kinds a list changes, and only a record of that kind.
    if (!CHANGEABLE.contains(kind) || recordId.getSObjectType() != type) {
      throw ImportListSaves.unreadable();
    }
    return type.newSObject(keys.existing(recordId));
  }

  /**
   * Puts in the links to other records; returns the ones to a record of the same kind not saved
   * yet ([field, key]), to be written after.
   */
  public List<List<Object>> putLinks(SObject row, ImportPlan.Entry entry) {
    List<List<Object>> waiting = new List<List<Object>>();
    Map<String, Object> links = entry.valuesOf('refs');
    for (String field : links.keySet()) {
      if (!LINK_FIELDS.get(kind).contains(field)) {
        throw ImportListSaves.unreadable();
      }
      String target = (String) links.get(field);
      Boolean sameKindNotYet =
        target != null &&
        target.startsWith(kind + ':') &&
        !keys.knows(target);
      if (sameKindNotYet) {
        waiting.add(new List<Object>{ field, target });
      } else {
        row.put(field, keys.of(target));
      }
    }
    return waiting;
  }
}
