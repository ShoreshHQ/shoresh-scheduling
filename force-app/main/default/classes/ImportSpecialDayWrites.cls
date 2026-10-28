/**
 * Saves one week's day with its own time blocks (docs/import/weeks.md INGEST-4.3, a short Friday
 * in week 2) as a special day (ADR 0014): the special day, its plan with the file's own time
 * blocks and the file's cells (the groups and activities by the Ids just saved), and its place on
 * that week's day. The program's own time blocks are not touched. All three are kept for Undo.
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
      dates.add(
        new SpecialDate__c(
          Season__c = plan.seasonId,
          SpecialDay__c = days[i].Id,
          Week__c = versions.weekOf(entries[i]),
          Day__c = entries[i].text('day')
        )
      );
      ScheduleGrid grid = versions.specialDayGrid(entries[i].valuesOf('grid'));
      List<String> texts = ScheduleGridParts.split(grid);
      for (Integer p = 0; p < texts.size(); p++) {
        parts.add(
          new PlanPart__c(
            Season__c = plan.seasonId,
            SpecialDay__c = days[i].Id,
            Part__c = p + 1,
            Plan__c = texts[p],
            GridFormatVersion__c = ScheduleGridLocks.formatOf(grid),
            Revision__c = 1
          )
        );
      }
    }
    writer.saveTracked('SpecialDate', dates);
    writer.saveTracked('PlanPart', parts);
  }
}
