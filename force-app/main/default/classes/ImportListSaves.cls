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
public with sharing class ImportListSaves implements SetupWrite.Steps {
  // Kinds in the order they depend on each other.
  private static final List<String> ORDER = new List<String>{
    // A camp workbook's weeks first, and the weeks items are off last (part D, INGEST-1.8).
    'Week',
    'LocationType',
    'Location',
    'Program',
    'Division',
    'Group',
    'TimeBlock',
    'Activity',
    'FixedActivity',
    'RecurringActivity',
    // The Electives screen's list: sets, then their offerings (of activities added above).
    'ElectiveSet',
    'Offering',
    // The Special events screen's list (SPECIAL-2.3), after the places an event names.
    'SpecialDay',
    'SpecialEvent',
    'WeekException'
  };
  // What Undo needs must fit in the import's record (Import__c long text fields).
  private static final Integer LOG_LIMIT = 131072;

  private ImportPlan plan;
  private ImportKeys keys;
  private ImportWriter writer;
  private Boolean workbook;
  private List<ImportPlan.Entry> weeksBackOn = new List<ImportPlan.Entry>();
  private Id campId;

  /** One screen's list. */
  public static ImportSetupSaves.Result save(String planText) {
    return new ImportListSaves(new ImportPlan(planText), false).run();
  }

  /** A camp workbook (part D): every list, the weeks, the weeks items run, the camp's words. */
  public static ImportSetupSaves.Result saveWorkbook(String planText) {
    return new ImportListSaves(new ImportPlan(planText), true).run();
  }

  private ImportListSaves(ImportPlan plan, Boolean workbook) {
    this.plan = plan;
    this.workbook = workbook;
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
    campId = seasons[0].Camp__c;
    SetupWrite.run(SetupWrite.Kind.SAVE, this);
    return writer.result;
  }

  /** Every list's rows, in order, and the import's record (SetupWrite runs it). */
  public void write() {
    Map<String, List<ImportPlan.Entry>> byKind = byKind();
    ImportWorkbookExtras extras = new ImportWorkbookExtras(
      writer,
      plan.seasonId,
      campId
    );
    // Another season's workbook into a season with no weeks: filled first, then paired.
    if (workbook) {
      extras.fillWeeks(plan.entries('fillWeeks'));
    }
    for (String kind : ORDER) {
      saveKind(kind, byKind.get(kind));
    }
    // Weeks an item is on again: a workbook's Which weeks, or a list's Weeks (INGEST-1.8).
    extras.weeksBackOn(weeksBackOn);
    if (workbook) {
      extras.campWords(plan.entries('campWords'));
    }
    ImportAnswers.save(campId, plan);
    writer.result.importId = record();
  }

  private Map<String, List<ImportPlan.Entry>> byKind() {
    Map<String, List<ImportPlan.Entry>> result = new Map<String, List<ImportPlan.Entry>>();
    for (ImportPlan.Entry entry : plan.entries('records')) {
      String kind = entry.text('kind');
      if (!allowed(kind)) {
        throw unreadable();
      }
      // A week an item is off no longer (a workbook's Which weeks, a list's Weeks): removed
      // after the rest.
      if (kind == 'WeekException' && entry.text('remove') == 'true') {
        weeksBackOn.add(entry);
        continue;
      }
      entriesOf(result, kind).add(entry);
    }
    return result;
  }

  private Boolean allowed(String kind) {
    return workbook
      ? ImportListRows.isWorkbookKind(kind)
      : ImportListRows.isListKind(kind);
  }

  private static List<ImportPlan.Entry> entriesOf(
    Map<String, List<ImportPlan.Entry>> byKind,
    String kind
  ) {
    if (!byKind.containsKey(kind)) {
      byKind.put(kind, new List<ImportPlan.Entry>());
    }
    return byKind.get(kind);
  }

  private void saveKind(String kind, List<ImportPlan.Entry> entries) {
    if (entries == null) {
      return;
    }
    Schema.SObjectType type = ImportFields.ofTerm(kind);
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
    // SPECIAL-2.6: a special day the list adds starts from the regular day, as one by hand.
    new ImportListSeeds(writer.result).seed(kind, entries, rows);
    if (kind == 'Activity' || kind == 'RecurringActivity') {
      new ImportListWho(writer, kind, plan.seasonId).save(entries, rows);
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
      row.put((Schema.SObjectField) link[1], keys.of((String) link[2]));
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
        workbook
          ? 'This worksheet is too big to be undone later, so nothing was saved. Import its sheets on their own screens.'
          : 'This list is too long to be undone later, so nothing was saved. Split it into two files and import each one.'
      );
    }
    return ImportLog.record(plan, created, changed);
  }

  public static ShoreshException unreadable() {
    return new ShoreshException(
      'The import could not be read. Start it again.'
    );
  }
}
