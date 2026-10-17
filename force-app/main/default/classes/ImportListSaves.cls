/**
 * Saves a setup list imported on one screen (slice 4c), once the director has answered every
 * question: new records are added, and existing ones change only in the fields the director
 * chose to Change. All or none, in user mode, every Id checked to be in the season, and recorded
 * like Import last year so "Undo last import" covers it.
 *
 * The screen sends records by kind, each with plain fields and fields naming another record (by
 * the key of one added in the same save, or an Id); only the fields ImportListRows lists are
 * written.
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
      if (!ImportListRows.isKind(kind)) {
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
    ImportListRows build = new ImportListRows(plan.seasonId, keys, kind);
    for (Integer i = 0; i < entries.size(); i++) {
      SObject row = build.rowFor(entries[i]);
      for (List<Object> link : build.putLinks(row, entries[i])) {
        later.add(new List<Object>{ i, link[0], link[1] });
      }
      rows.add(row);
    }
    writeChanged(kind, entries, rows);
    writeLater(type, rows, later);
    if (kind == 'Activity') {
      new ImportListWho(writer).save(entries, rows);
    }
  }

  /**
   * Saves the new records and the existing ones with something to change; an existing activity
   * changed only in who can do it is not written (nor counted as changed) here.
   */
  private void writeChanged(
    String kind,
    List<ImportPlan.Entry> entries,
    List<SObject> rows
  ) {
    List<ImportPlan.Entry> writing = new List<ImportPlan.Entry>();
    List<SObject> written = new List<SObject>();
    for (Integer i = 0; i < entries.size(); i++) {
      if (entries[i].isNew() || rows[i].getPopulatedFieldsAsMap().size() > 1) {
        writing.add(entries[i]);
        written.add(rows[i]);
      }
    }
    writer.write(kind, writing, written);
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

  public static ShoreshException unreadable() {
    return new ShoreshException(
      'The import could not be read. Start it again.'
    );
  }
}
