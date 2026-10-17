/**
 * Saves last year's week as versions (slice 4b): for each program and week in the files, a
 * schedule "Imported from <file>" (Status Version, Origin Imported) with one grid per day in the
 * compact format v1 (ScheduleGrid). The screen builds each grid with the keys of the records it
 * names; the Ids are put in here, once everything else is saved.
 */
public with sharing class ImportVersionWrites {
  private ImportPlan plan;
  private ImportWriter writer;

  public ImportVersionWrites(ImportPlan plan, ImportWriter writer) {
    this.plan = plan;
    this.writer = writer;
  }

  public void run() {
    List<ImportPlan.Entry> entries = plan.entries('versions');
    List<SObject> schedules = new List<SObject>();
    for (ImportPlan.Entry entry : entries) {
      schedules.add(
        new Schedule__c(
          Program__c = writer.keys.of(entry.text('programKey')),
          Week__c = writer.keys.existing((Id) entry.text('weekId')),
          Name = entry.text('name').left(80),
          Status__c = 'Version',
          Origin__c = 'Imported',
          VersionReason__c = 'Imported'
        )
      );
    }
    writer.saveTracked('Schedule', schedules);
    for (Integer i = 0; i < entries.size(); i++) {
      ScheduleDaySaves.write(schedules[i].Id, days(entries[i]));
      writer.result.countAdded('Version');
    }
  }

  private List<ScheduleDaySaves.DaySave> days(ImportPlan.Entry entry) {
    List<ScheduleDaySaves.DaySave> result = new List<ScheduleDaySaves.DaySave>();
    for (Object item : entry.objects('days')) {
      Map<String, Object> day = (Map<String, Object>) item;
      result.add(
        new ScheduleDaySaves.DaySave(
          Date.valueOf((String) day.get('date')),
          grid((Map<String, Object>) day.get('grid')),
          null
        )
      );
    }
    return result;
  }

  /** The screen's grid with every key replaced by its record's Id. */
  private ScheduleGrid grid(Map<String, Object> raw) {
    ScheduleGrid grid = new ScheduleGrid();
    for (List<String> b : tuples(raw.get('b'))) {
      grid.blocks.add(new ScheduleGrid.Block(idOf(b[0]), b[1]).at(b[2], b[3]));
    }
    for (List<String> g : tuples(raw.get('g'))) {
      grid.groups.add(new ScheduleGrid.GroupRef(idOf(g[0]), g[1]));
    }
    for (List<String> i : tuples(raw.get('i'))) {
      grid.items.add(
        new ScheduleGrid.Item(
          i[0],
          String.isBlank(i[1]) ? '' : idOf(i[1]),
          i[2]
        )
      );
    }
    for (Object row : (List<Object>) raw.get('r')) {
      grid.rows.add(String.valueOf(row).split(',', -1));
    }
    return grid;
  }

  private String idOf(String key) {
    return String.valueOf(writer.keys.of(key));
  }

  private static List<List<String>> tuples(Object value) {
    List<List<String>> result = new List<List<String>>();
    for (Object entry : (List<Object>) value) {
      List<String> strings = new List<String>();
      for (Object part : (List<Object>) entry) {
        strings.add(part == null ? '' : String.valueOf(part));
      }
      result.add(strings);
    }
    return result;
  }
}
