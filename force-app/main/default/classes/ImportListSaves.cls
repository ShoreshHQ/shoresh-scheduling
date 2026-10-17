/**
 * Saves a setup list imported on one screen (slice 4c), once the director has answered every
 * question: new records are added, and existing ones change only in the fields the director
 * chose to Change. All or none, in user mode, every Id checked to be in the season, and recorded
 * like Import last year so "Undo last import" covers it.
 *
 * The screen sends records by kind, each with plain fields and fields naming another record (by
 * the key of one added in the same save, or an Id); only the fields listed here are written.
 */
public with sharing class ImportListSaves {
  // Kinds in the order they depend on each other.
  private static final List<String> ORDER = new List<String>{
    'LocationType',
    'Location',
    'Division',
    'Group',
    'Activity'
  };
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
  // What Undo needs must fit in the import's record (Import__c long text fields).
  private static final Integer LOG_LIMIT = 131072;

  private ImportPlan plan;
  private ImportKeys keys;
  private ImportWriter writer;

  public static ImportSetupSaves.Result save(String planText) {
    return new ImportListSaves(new ImportPlan(planText)).run();
  }

  private ImportListSaves(ImportPlan plan) {
    this.plan = plan;
  }

  private ImportSetupSaves.Result run() {
    // Locked: imports and Undos in one season take turns (ImportUndo.lockSeason).
    List<Season__c> seasons = [
      SELECT Id, Camp__c
      FROM Season__c
      WHERE Id = :plan.seasonId
      WITH USER_MODE
      FOR UPDATE
    ];
    if (seasons.isEmpty()) {
      throw new ShoreshException(
        'That ' +
          CampLabels.modelTermsOnly().singularInSentence('Season') +
          ' was not found, or you do not have access to it.'
      );
    }
    keys = new ImportKeys(
      plan.seasonId,
      CampLabels.forCamp(seasons[0].Camp__c)
    );
    writer = new ImportWriter(keys);
    Map<String, List<ImportPlan.Entry>> byKind = byKind();
    SetTimeGuard.defer();
    Savepoint beforeSave = Database.setSavepoint();
    try {
      for (String kind : ORDER) {
        if (byKind.containsKey(kind)) {
          saveKind(kind, byKind.get(kind));
        }
      }
      SetTimeGuard.checkPending();
      ImportAnswers.save(seasons[0].Camp__c, plan);
      writer.result.importId = record();
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw e;
    } finally {
      SetTimeGuard.resume();
    }
    return writer.result;
  }

  private Map<String, List<ImportPlan.Entry>> byKind() {
    Map<String, List<ImportPlan.Entry>> result = new Map<String, List<ImportPlan.Entry>>();
    for (ImportPlan.Entry entry : plan.entries('records')) {
      String kind = entry.text('kind');
      if (!PLAIN_FIELDS.containsKey(kind)) {
        throw unreadable();
      }
      if (!result.containsKey(kind)) {
        result.put(kind, new List<ImportPlan.Entry>());
      }
      result.get(kind).add(entry);
    }
    return result;
  }

  private void saveKind(String kind, List<ImportPlan.Entry> entries) {
    Schema.SObjectType type = Schema.getGlobalDescribe().get(kind + '__c');
    List<SObject> rows = new List<SObject>();
    // Links to records of the same kind added in this save: written once those exist.
    List<List<Object>> later = new List<List<Object>>();
    for (Integer i = 0; i < entries.size(); i++) {
      SObject row = rowFor(kind, type, entries[i]);
      for (List<Object> link : putLinks(kind, row, entries[i])) {
        later.add(new List<Object>{ i, link[0], link[1] });
      }
      rows.add(row);
    }
    writer.write(kind, entries, rows);
    writeLater(type, rows, later);
    if (kind == 'Activity') {
      new ImportListWho(writer).save(entries, rows);
    }
  }

  /** A new record (in the season, where its kind is) or an existing one, with its plain fields. */
  private SObject rowFor(
    String kind,
    Schema.SObjectType type,
    ImportPlan.Entry entry
  ) {
    SObject row = entry.isNew()
      ? type.newSObject()
      : type.newSObject(keys.existing(entry.id()));
    if (entry.isNew() && IN_SEASON.contains(kind)) {
      row.put('Season__c', plan.seasonId);
    }
    Map<String, Object> values = entry.valuesOf('fields');
    for (String field : values.keySet()) {
      if (!PLAIN_FIELDS.get(kind).contains(field)) {
        throw unreadable();
      }
      row.put(field, ImportUndoValues.asField(type, field, values.get(field)));
    }
    return row;
  }

  /**
   * Puts in the links to other records; returns the ones to a record of the same kind not saved
   * yet ([field, key]), to be written after.
   */
  private List<List<Object>> putLinks(
    String kind,
    SObject row,
    ImportPlan.Entry entry
  ) {
    List<List<Object>> waiting = new List<List<Object>>();
    Map<String, Object> links = entry.valuesOf('refs');
    for (String field : links.keySet()) {
      if (!LINK_FIELDS.get(kind).contains(field)) {
        throw unreadable();
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

  private void writeLater(
    Schema.SObjectType type,
    List<SObject> rows,
    List<List<Object>> later
  ) {
    if (later.isEmpty()) {
      return;
    }
    List<SObject> linked = new List<SObject>();
    for (List<Object> link : later) {
      SObject row = type.newSObject(rows[(Integer) link[0]].Id);
      row.put((String) link[1], keys.of((String) link[2]));
      linked.add(row);
    }
    writer.amend(linked);
  }

  /** The import's own record: its file, and what it created and changed (for Undo). */
  private Id record() {
    String created = JSON.serialize(writer.created);
    String changed = JSON.serialize(writer.changed);
    if (created.length() > LOG_LIMIT || changed.length() > LOG_LIMIT) {
      throw new ShoreshException(
        'This list is too long to be undone later, so nothing was saved. Split it into two files and import each one.'
      );
    }
    Import__c done = new Import__c(
      Season__c = plan.seasonId,
      Files__c = String.isBlank(plan.text('files'))
        ? null
        : plan.text('files').left(255),
      Created__c = created,
      Changed__c = changed
    );
    Database.insert(done, AccessLevel.USER_MODE);
    return done.Id;
  }

  private static ShoreshException unreadable() {
    return new ShoreshException(
      'The import could not be read. Start it again.'
    );
  }
}
