/**
 * Saves one week's day with its own time blocks (docs/import/weeks.md INGEST-4.3, a short Friday
 * in week 2) as a special day (ADR 0014): the special day, its plan with the file's own time
 * blocks and the file's cells (the groups and activities by the Ids just saved), and its place on
 * that week's day. The program's own time blocks are not touched. The special day and its day
 * are kept for Undo; its plan goes with it. All or nothing: a plan bigger than one schedule
 * holds, or a day that has a special day the screen did not know about, refuses the import.
 * A day with its own times every week (INGEST-4.12) is one special day and one plan, on that day
 * of each of its weeks (`also`): a special date a week.
 */
public with sharing class ImportSpecialDayWrites {
  private ImportPlan plan;
  private ImportWriter writer;

  public ImportSpecialDayWrites(ImportPlan plan, ImportWriter writer) {
    this.plan = plan;
    this.writer = writer;
  }

  public void run() {
    List<ImportPlan.Entry> entries = plan.entries('specialDays');
    if (entries.isEmpty()) {
      return;
    }
    ImportVersionWrites versions = new ImportVersionWrites(plan, writer);
    List<ScheduleGrid> grids = new List<ScheduleGrid>();
    List<List<Id>> weekIds = new List<List<Id>>();
    for (ImportPlan.Entry entry : entries) {
      ScheduleGrid grid = versions.specialDayGrid(entry.valuesOf('grid'));
      SpecialImportCheck.checkSize(grid.blocks.size(), grid.groups.size());
      grids.add(grid);
      List<Id> weeks = new List<Id>{ versions.weekOf(entry) };
      for (Object also : entry.objects('also')) {
        weeks.add(
          versions.weekOf(new ImportPlan.Entry((Map<String, Object>) also))
        );
      }
      weekIds.add(weeks);
    }
    checkFree(entries, weekIds);
    List<SpecialDay__c> days = new List<SpecialDay__c>();
    for (ImportPlan.Entry entry : entries) {
      days.add(
        new SpecialDay__c(
          Season__c = plan.seasonId,
          Name = entry.text('name').left(80)
        )
      );
    }
    writer.saveTracked('SpecialDay', days);
    List<SpecialDate__c> dates = new List<SpecialDate__c>();
    List<PlanPart__c> parts = new List<PlanPart__c>();
    for (Integer i = 0; i < entries.size(); i++) {
      writer.result.countAdded('SpecialDay');
      for (Id weekId : weekIds[i]) {
        dates.add(
          new SpecialDate__c(
            Season__c = plan.seasonId,
            SpecialDay__c = days[i].Id,
            Week__c = weekId,
            Day__c = entries[i].text('day')
          )
        );
      }
      parts.addAll(partsOf(days[i].Id, grids[i]));
    }
    writer.saveTracked('SpecialDate', dates);
    UserModeWrites.save(parts);
  }

  private List<PlanPart__c> partsOf(Id dayId, ScheduleGrid grid) {
    List<PlanPart__c> parts = new List<PlanPart__c>();
    List<String> texts = ScheduleGridParts.split(grid);
    for (Integer p = 0; p < texts.size(); p++) {
      parts.add(
        new PlanPart__c(
          Season__c = plan.seasonId,
          SpecialDay__c = dayId,
          Part__c = p + 1,
          Plan__c = texts[p],
          GridFormatVersion__c = ScheduleGridLocks.formatOf(grid),
          // Revision 1 is the import's: a later save is the director's (Undo keeps it).
          Revision__c = 1
        )
      );
    }
    return parts;
  }

  /**
   * Refuses the import when one of its days, or two of its entries, would hold two special days
   * (INGEST-4.6, 4.9): the screen leaves out a day the camp's special day already has, so one
   * found here was added since the files were read.
   */
  private void checkFree(
    List<ImportPlan.Entry> entries,
    List<List<Id>> weekIds
  ) {
    Map<String, String> taken = new Map<String, String>();
    for (SpecialDate__c row : [
      SELECT Week__c, Day__c, SpecialDay__r.Name
      FROM SpecialDate__c
      WHERE Season__c = :plan.seasonId AND SpecialDay__c != NULL
      WITH USER_MODE
    ]) {
      taken.put(row.Week__c + '|' + row.Day__c, row.SpecialDay__r.Name);
    }
    Set<String> seen = new Set<String>();
    for (Integer i = 0; i < entries.size(); i++) {
      for (Id weekId : weekIds[i]) {
        checkDay(weekId + '|' + entries[i].text('day'), taken, seen);
      }
    }
  }

  private void checkDay(
    String at,
    Map<String, String> taken,
    Set<String> seen
  ) {
    String day = at.substringAfter('|');
    if (taken.containsKey(at)) {
      throw new ShoreshException(
        day +
          ' of that week now has ' +
          taken.get(at) +
          ', added after these files were read. Nothing was saved: read the files again to see it, then save.'
      );
    }
    if (!seen.add(at)) {
      throw new ShoreshException(
        'Two of the files\' days would be the same day\'s special day. Nothing was saved: answer which one it is, then save.'
      );
    }
  }
}
