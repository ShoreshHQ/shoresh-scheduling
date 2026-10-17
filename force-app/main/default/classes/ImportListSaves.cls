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
    'Activity'
  };
  // What a list may write, per kind: plain fields...
  private static final Map<String, Set<String>> FIELDS = new Map<String, Set<String>>{
    'LocationType' => new Set<String>{ 'Name' },
    'Location' => new Set<String>{ 'Name', 'GroupsThatFit__c', 'Notes__c' },
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
  private static final Map<String, Set<String>> REFS = new Map<String, Set<String>>{
    'LocationType' => new Set<String>(),
    'Location' => new Set<String>{ 'LocationType__c' },
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
    keys = new ImportKeys(plan.seasonId, CampLabels.forCamp(seasons[0].Camp__c));
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
      if (!FIELDS.containsKey(kind)) {
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
      ImportPlan.Entry entry = entries[i];
      SObject row = entry.isNew()
        ? type.newSObject()
        : type.newSObject(keys.existing(entry.id()));
      if (entry.isNew()) {
        row.put('Season__c', plan.seasonId);
      }
      Map<String, Object> fields = entry.valuesOf('fields');
      for (String field : fields.keySet()) {
        if (!FIELDS.get(kind).contains(field)) {
          throw unreadable();
        }
        row.put(field, ImportUndoValues.asField(type, field, fields.get(field)));
      }
      Map<String, Object> refs = entry.valuesOf('refs');
      for (String field : refs.keySet()) {
        if (!REFS.get(kind).contains(field)) {
          throw unreadable();
        }
        String target = (String) refs.get(field);
        if (
          target != null &&
          target.startsWith(kind + ':') &&
          !keys.knows(target)
        ) {
          later.add(new List<Object>{ i, field, target });
        } else {
          row.put(field, keys.of(target));
        }
      }
      rows.add(row);
    }
    writer.write(kind, entries, rows);
    if (!later.isEmpty()) {
      List<SObject> links = new List<SObject>();
      for (List<Object> link : later) {
        SObject row = type.newSObject(rows[(Integer) link[0]].Id);
        row.put((String) link[1], keys.of((String) link[2]));
        links.add(row);
      }
      writer.amend(links);
    }
    if (kind == 'Activity') {
      saveWho(entries, rows);
    }
  }

  /**
   * Who can do each activity: a new one's list is added; an existing one's is replaced only when
   * the director chose Change (the list is sent only then), and Undo can put the old one back.
   */
  private void saveWho(List<ImportPlan.Entry> entries, List<SObject> rows) {
    List<SObject> added = new List<SObject>();
    List<SObject> replacing = new List<SObject>();
    Map<Id, List<String>> after = new Map<Id, List<String>>();
    for (Integer i = 0; i < entries.size(); i++) {
      if (!entries[i].has('who')) {
        continue;
      }
      List<SObject> who = new List<SObject>();
      List<String> targets = new List<String>();
      for (String target : entries[i].texts('who')) {
        Id targetId = keys.of(target);
        ActivityEligibility__c row = new ActivityEligibility__c(
          Activity__c = rows[i].Id
        );
        row.put(ImportItemWrites.targetField(targetId), targetId);
        who.add(row);
        targets.add(targetId);
      }
      if (entries[i].isNew()) {
        added.addAll(who);
      } else {
        replacing.addAll(who);
        targets.sort();
        after.put(rows[i].Id, targets);
      }
    }
    writer.saveTracked('ActivityEligibility', added);
    if (after.isEmpty()) {
      return;
    }
    Set<Id> owners = after.keySet();
    List<ActivityEligibility__c> old = new List<ActivityEligibility__c>();
    for (Activity__c activity : [
      SELECT
        Id,
        Name,
        (SELECT Id, Division__c, Group__c FROM Eligibilities__r)
      FROM Activity__c
      WHERE Id IN :owners
      WITH USER_MODE
    ]) {
      List<String> before = new List<String>();
      for (ActivityEligibility__c row : activity.Eligibilities__r) {
        before.add(row.Division__c != null ? row.Division__c : row.Group__c);
        old.add(row);
      }
      before.sort();
      writer.logWho(
        'ActivityEligibility__c',
        activity.Id,
        activity.Name,
        before,
        after.get(activity.Id)
      );
    }
    Database.delete(old, AccessLevel.USER_MODE);
    UserModeWrites.save(replacing);
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
    return new ShoreshException('The import could not be read. Start it again.');
  }
}
