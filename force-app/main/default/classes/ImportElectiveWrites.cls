/**
 * Saves the electives Import last year read in the file (electives slice E9; repo ADR 0006 choice
 * 23, ADR 0018 choices 45 to 50): new elective sets, the offerings it adds (proposed, seats not
 * filled in, as the desktop's import writes its choices "potential"), and the linked choices a
 * double period makes, with their periods. Only added, never changed: a set the camp has keeps
 * what it has. Runs after the activities (an offering names one) and before the versions (a cell
 * names its set), in user mode, all or none with the rest of the import.
 */
public with sharing class ImportElectiveWrites {
  private ImportPlan plan;
  private ImportWriter writer;

  public ImportElectiveWrites(ImportPlan plan, ImportWriter writer) {
    this.plan = plan;
    this.writer = writer;
  }

  public void run() {
    saveSets();
    saveOfferings();
    saveLinkedChoices();
  }

  private void saveSets() {
    List<ImportPlan.Entry> entries = added('electiveSets');
    List<SObject> rows = new List<SObject>();
    for (ImportPlan.Entry entry : entries) {
      ElectiveSet__c electiveSet = new ElectiveSet__c(
        Season__c = plan.seasonId,
        Name = entry.text('name')
      );
      withTime(electiveSet, entry);
      rows.add(electiveSet);
    }
    writer.write('ElectiveSet', entries, rows);
    saveWho(entries, rows);
  }

  /**
   * The set's time as the file shows it (repo ADR 0027; ELECT-7.2, 7.5): its time block (one the
   * import adds, by key, or one the camp has), its last block for a run of blocks, and its days.
   * No time when the file shows none.
   */
  private void withTime(ElectiveSet__c electiveSet, ImportPlan.Entry entry) {
    String blockKey = entry.text('blockKey');
    if (String.isBlank(blockKey)) {
      return;
    }
    electiveSet.TimeBlock__c = writer.keys.of(blockKey);
    String lastBlockKey = entry.text('lastBlockKey');
    if (String.isNotBlank(lastBlockKey)) {
      electiveSet.LastTimeBlock__c = writer.keys.of(lastBlockKey);
    }
    for (Object day : entry.objects('days')) {
      Schema.SObjectField field = SetTimePlan.dayField(
        ElectiveSet__c.SObjectType,
        String.valueOf(day)
      );
      if (field != null) {
        electiveSet.put(field, true);
      }
    }
  }

  /**
   * ELECT-7.4: who each new set's time is for, as the file shows it: a Coverage row per division
   * or group; none means every group of its program. Undo removes them with the set.
   */
  private void saveWho(List<ImportPlan.Entry> entries, List<SObject> rows) {
    ImportWhoKinds.Kind setWho = ImportWhoKinds.forOwner('ElectiveSet');
    List<SObject> who = new List<SObject>();
    for (Integer i = 0; i < entries.size(); i++) {
      if (String.isBlank(entries[i].text('blockKey'))) {
        continue;
      }
      for (String target : entries[i].texts('who')) {
        who.add(setWho.row(rows[i].Id, writer.keys.of(target), plan.seasonId));
      }
    }
    writer.saveTracked('Coverage', who);
  }

  private void saveOfferings() {
    List<ImportPlan.Entry> entries = added('offerings');
    List<SObject> rows = new List<SObject>();
    for (ImportPlan.Entry entry : entries) {
      rows.add(
        new Offering__c(
          ElectiveSet__c = writer.keys.of(entry.text('setKey')),
          Activity__c = writer.keys.of(entry.text('activityKey')),
          Proposed__c = true,
          NoSeatLimit__c = false
        )
      );
    }
    writer.write('Offering', entries, rows);
  }

  private void saveLinkedChoices() {
    List<ImportPlan.Entry> entries = added('linkedChoices');
    List<SObject> rows = new List<SObject>();
    for (ImportPlan.Entry entry : entries) {
      rows.add(
        new LinkedChoice__c(
          Name = entry.text('name'),
          ElectiveSet__c = writer.keys.of(entry.text('setKey')),
          Offering__c = writer.keys.of(entry.text('offeringKey')),
          AppliesTo__c = 'All',
          SortOrder__c = entry.whole('sortOrder')
        )
      );
    }
    writer.write('LinkedChoice', entries, rows);
    // Each one's periods, all in one save; they go with it on Undo (master-detail).
    List<SObject> times = new List<SObject>();
    for (Integer i = 0; i < entries.size(); i++) {
      for (Object item : entries[i].objects('times')) {
        ImportPlan.Entry period = new ImportPlan.Entry(
          (Map<String, Object>) item
        );
        times.add(
          new LinkedChoiceTime__c(
            LinkedChoice__c = rows[i].Id,
            Weekday__c = period.text('weekday'),
            TimeBlock__c = writer.keys.of(period.text('blockKey'))
          )
        );
      }
    }
    writer.saveTracked('LinkedChoiceTime', times);
  }

  /** A list's entries: only ever new records here, so one naming a record is refused. */
  private List<ImportPlan.Entry> added(String listName) {
    List<ImportPlan.Entry> entries = plan.entries(listName);
    for (ImportPlan.Entry entry : entries) {
      if (!entry.isNew()) {
        throw ImportListSaves.unreadable();
      }
    }
    return entries;
  }
}
