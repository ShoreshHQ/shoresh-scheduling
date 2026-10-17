/**
 * Saves the structure part of an import: programs (new ones, or days added to one), time blocks
 * (new ones, or new times for one), divisions, and groups. New records are inserted in user
 * mode, one list per kind, and their keys recorded for what comes after.
 */
public with sharing class ImportStructureWrites {
  private static final List<String> WEEKDAYS = new List<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday'
  };

  private ImportPlan plan;
  private ImportKeys keys;
  private ImportWriter writer;

  public ImportStructureWrites(ImportPlan plan, ImportWriter writer) {
    this.plan = plan;
    this.writer = writer;
    this.keys = writer.keys;
  }

  public void run() {
    savePrograms();
    saveTimeBlocks();
    saveDivisions();
    saveGroups();
  }

  private void savePrograms() {
    List<SObject> rows = new List<SObject>();
    List<ImportPlan.Entry> entries = plan.entries('programs');
    for (ImportPlan.Entry entry : entries) {
      Program__c program = entry.isNew()
        ? new Program__c(
            Season__c = plan.seasonId,
            Name = entry.text('name'),
            SortOrder__c = entry.whole('sortOrder')
          )
        : new Program__c(Id = keys.existing(entry.id()));
      Set<String> days = new Set<String>(entry.texts('days'));
      for (String day : WEEKDAYS) {
        program.put(day + '__c', days.contains(day));
      }
      rows.add(program);
    }
    writer.write('Program', entries, rows);
  }

  private void saveTimeBlocks() {
    List<SObject> rows = new List<SObject>();
    List<ImportPlan.Entry> entries = plan.entries('timeBlocks');
    for (ImportPlan.Entry entry : entries) {
      TimeBlock__c block = entry.isNew()
        ? new TimeBlock__c(
            Program__c = keys.of(entry.text('programKey')),
            Name = entry.text('name'),
            SortOrder__c = entry.whole('sortOrder')
          )
        : new TimeBlock__c(Id = keys.existing(entry.id()));
      block.StartTime__c = entry.clock('start');
      block.EndTime__c = entry.clock('end');
      if (entry.has('partOfDay')) {
        // Only new blocks: a changed block keeps the part of day the camp gave it.
        block.PartOfDay__c = entry.text('partOfDay');
      }
      rows.add(block);
    }
    writer.write('TimeBlock', entries, rows);
  }

  private void saveDivisions() {
    List<SObject> rows = new List<SObject>();
    List<ImportPlan.Entry> entries = plan.entries('divisions');
    for (ImportPlan.Entry entry : entries) {
      rows.add(
        new Division__c(
          Program__c = keys.of(entry.text('programKey')),
          Name = entry.text('name'),
          SortOrder__c = entry.whole('sortOrder')
        )
      );
    }
    writer.write('Division', entries, rows);
  }

  private void saveGroups() {
    List<SObject> rows = new List<SObject>();
    List<ImportPlan.Entry> entries = plan.entries('groups');
    for (ImportPlan.Entry entry : entries) {
      rows.add(
        new Group__c(
          Division__c = keys.of(entry.text('divisionKey')),
          Name = entry.text('name'),
          Availability__c = 'AllDay',
          SortOrder__c = entry.whole('sortOrder')
        )
      );
    }
    writer.write('Group', entries, rows);
  }
}
