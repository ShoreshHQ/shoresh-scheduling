/**
 * Saves the items part of an import: locations, activities (with who can do each), fixed
 * activities, and recurring activities (with who each covers). Existing items are only changed
 * where the director said so (a new length, time block, or days).
 */
public with sharing class ImportItemWrites {
  // The plan's day names, with the recurring activity field each one sets.
  private static final Map<String, Schema.SObjectField> DAY_FIELDS = new Map<String, Schema.SObjectField>{
    'Monday' => RecurringActivity__c.Monday__c,
    'Tuesday' => RecurringActivity__c.Tuesday__c,
    'Wednesday' => RecurringActivity__c.Wednesday__c,
    'Thursday' => RecurringActivity__c.Thursday__c,
    'Friday' => RecurringActivity__c.Friday__c,
    'Saturday' => RecurringActivity__c.Saturday__c,
    'Sunday' => RecurringActivity__c.Sunday__c
  };

  private ImportPlan plan;
  private ImportKeys keys;
  private ImportWriter writer;

  public ImportItemWrites(ImportPlan plan, ImportWriter writer) {
    this.plan = plan;
    this.writer = writer;
    this.keys = writer.keys;
  }

  public void run() {
    saveLocations();
    saveActivities();
    saveFixed();
    saveRecurring();
  }

  private void saveLocations() {
    List<SObject> rows = new List<SObject>();
    List<ImportPlan.Entry> entries = plan.entries('locations');
    for (ImportPlan.Entry entry : entries) {
      rows.add(
        new Location__c(
          Season__c = plan.seasonId,
          Name = entry.text('name'),
          GroupsThatFit__c = entry.whole('groupsThatFit')
        )
      );
    }
    writer.write('Location', entries, rows);
  }

  private void saveActivities() {
    List<SObject> rows = new List<SObject>();
    List<ImportPlan.Entry> entries = plan.entries('activities');
    for (ImportPlan.Entry entry : entries) {
      rows.add(entry.isNew() ? newActivity(entry) : changedActivity(entry));
    }
    writer.write('Activity', entries, rows);
    List<SObject> who = new List<SObject>();
    ImportWhoKinds.Kind canDo = ImportWhoKinds.forOwner('Activity');
    for (ImportPlan.Entry entry : entries) {
      Id activityId = entry.isNew() ? keys.of(entry.key()) : null;
      for (String target : entry.texts('who')) {
        ActivityEligibility__c row = new ActivityEligibility__c(
          Activity__c = activityId
        );
        row.put(canDo.targetField(keys.of(target)), keys.of(target));
        who.add(row);
      }
    }
    writer.saveTracked('ActivityEligibility', who);
  }

  private Activity__c newActivity(ImportPlan.Entry entry) {
    return new Activity__c(
      Season__c = plan.seasonId,
      Name = entry.text('name'),
      Location__c = keys.of(entry.text('locationKey')),
      Length__c = entry.whole('length'),
      TimesPerWeekMin__c = entry.whole('min'),
      TimesPerWeekMax__c = entry.whole('max'),
      NoWeeklyMax__c = false,
      GroupsAtOnce__c = entry.whole('groupsAtOnce'),
      NoGroupLimit__c = false,
      SortOrder__c = entry.whole('sortOrder')
    );
  }

  private Activity__c changedActivity(ImportPlan.Entry entry) {
    return new Activity__c(
      Id = keys.existing(entry.id()),
      Length__c = entry.whole('length')
    );
  }

  private void saveFixed() {
    List<SObject> rows = new List<SObject>();
    List<ImportPlan.Entry> entries = plan.entries('fixedActivities');
    for (ImportPlan.Entry entry : entries) {
      FixedActivity__c item = entry.isNew()
        ? new FixedActivity__c(
            Program__c = keys.of(entry.text('programKey')),
            Name = entry.text('name'),
            Location__c = keys.of(entry.text('locationKey'))
          )
        : new FixedActivity__c(Id = keys.existing(entry.id()));
      item.TimeBlock__c = keys.of(entry.text('blockKey'));
      item.Length__c = entry.whole('length');
      // An early end (INGEST-4.13): that day it starts earlier, to its usual end. A change
      // that names none leaves the director's own early day as it is.
      if (entry.isNew() || entry.text('earlyDay') != null) {
        item.EarlyDay__c = entry.text('earlyDay');
        item.EarlyBlocks__c = entry.whole('earlyBlocks');
      }
      rows.add(item);
    }
    writer.write('FixedActivity', entries, rows);
  }

  private void saveRecurring() {
    List<SObject> rows = new List<SObject>();
    List<ImportPlan.Entry> entries = plan.entries('recurringActivities');
    for (ImportPlan.Entry entry : entries) {
      RecurringActivity__c item = entry.isNew()
        ? new RecurringActivity__c(
            Program__c = keys.of(entry.text('programKey')),
            Name = entry.text('name'),
            Location__c = keys.of(entry.text('locationKey'))
          )
        : new RecurringActivity__c(Id = keys.existing(entry.id()));
      item.TimeBlock__c = keys.of(entry.text('blockKey'));
      item.Length__c = entry.whole('length');
      Set<String> days = new Set<String>(entry.texts('days'));
      for (String day : DAY_FIELDS.keySet()) {
        item.put(DAY_FIELDS.get(day), days.contains(day));
      }
      rows.add(item);
    }
    writer.write('RecurringActivity', entries, rows);
    saveCoverage(entries, rows);
  }

  /** Who each new recurring activity covers: none means everyone in its program. */
  private void saveCoverage(
    List<ImportPlan.Entry> entries,
    List<SObject> rows
  ) {
    List<SObject> coverage = new List<SObject>();
    ImportWhoKinds.Kind covers = ImportWhoKinds.forOwner('RecurringActivity');
    for (Integer i = 0; i < entries.size(); i++) {
      if (!entries[i].isNew()) {
        continue;
      }
      for (String target : entries[i].texts('who')) {
        Coverage__c row = new Coverage__c(
          Season__c = plan.seasonId,
          RecurringActivity__c = rows[i].Id
        );
        row.put(covers.targetField(keys.of(target)), keys.of(target));
        coverage.add(row);
      }
    }
    writer.saveTracked('Coverage', coverage);
  }
}
