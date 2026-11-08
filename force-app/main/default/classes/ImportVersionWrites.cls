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
    // The imported week is kept as it came in; only the import writes it (ImportedWeekGuard).
    ImportedWeekGuard.allow();
    try {
      write();
    } finally {
      ImportedWeekGuard.done();
    }
  }

  private void write() {
    List<ImportPlan.Entry> entries = new List<ImportPlan.Entry>();
    List<SObject> schedules = new List<SObject>();
    List<List<ScheduleDaySaves.DaySave>> allDays = new List<List<ScheduleDaySaves.DaySave>>();
    List<ImportPlan.Entry> asked = plan.entries('versions');
    if (asked.isEmpty()) {
      return;
    }
    Set<String> kept = keptAlready();
    for (ImportPlan.Entry entry : asked) {
      Schedule__c schedule = new Schedule__c(
        Program__c = writer.keys.of(entry.text('programKey')),
        Week__c = weekOf(entry),
        Name = entry.text('name').left(80),
        Status__c = 'Version',
        Origin__c = 'Imported',
        VersionReason__c = 'Imported'
      );
      List<ScheduleDaySaves.DaySave> days = days(entry);
      // The same files imported again: the version kept last time is the same, so it isn't kept
      // twice (break-and-rebuild N1). Any difference in a cell keeps a new one.
      if (kept.contains(fingerprint(schedule, days))) {
        continue;
      }
      entries.add(entry);
      schedules.add(schedule);
      allDays.add(days);
    }
    writer.saveTracked('Schedule', schedules);
    // All the versions' days in one save (an import may hold many weeks).
    Map<Id, List<ScheduleDaySaves.DaySave>> daysBySchedule = new Map<Id, List<ScheduleDaySaves.DaySave>>();
    for (Integer i = 0; i < schedules.size(); i++) {
      daysBySchedule.put(schedules[i].Id, allDays[i]);
      writer.result.countAdded('Version');
    }
    ScheduleDaySaves.writeAll(daysBySchedule);
  }

  /** Each imported version already kept in this season, as fingerprint makes it. */
  private Set<String> keptAlready() {
    Id seasonId = plan.seasonId;
    Map<Id, Schedule__c> versions = new Map<Id, Schedule__c>(
      [
        SELECT Id, Program__c, Week__c, Name
        FROM Schedule__c
        WHERE
          Program__r.Season__c = :seasonId
          AND Status__c = 'Version'
          AND Origin__c = 'Imported'
        WITH USER_MODE
      ]
    );
    Set<String> result = new Set<String>();
    if (versions.isEmpty()) {
      return result;
    }
    Map<Id, List<ScheduleDays.DayGrid>> read = ScheduleDays.read(
      versions.keySet()
    );
    for (Schedule__c version : versions.values()) {
      List<ScheduleDaySaves.DaySave> days = new List<ScheduleDaySaves.DaySave>();
      for (ScheduleDays.DayGrid day : read.get(version.Id)) {
        days.add(new ScheduleDaySaves.DaySave(day.day, day.grid, null));
      }
      result.add(fingerprint(version, days));
    }
    return result;
  }

  /** A version's program, week, name and every day's cells, as one text. */
  private static String fingerprint(
    Schedule__c version,
    List<ScheduleDaySaves.DaySave> days
  ) {
    List<String> parts = new List<String>{
      version.Program__c,
      version.Week__c,
      version.Name
    };
    for (ScheduleDaySaves.DaySave day : days) {
      parts.add(
        String.valueOf(day.day) +
          '=' +
          (day.grid == null ? '' : day.grid.toText())
      );
    }
    return String.join(parts, '|');
  }

  /** A season week by Id, or one this import filled in from the season's dates, by its key. */
  public Id weekOf(ImportPlan.Entry entry) {
    String key = entry.text('weekKey');
    if (String.isBlank(key)) {
      return writer.keys.existing((Id) entry.text('weekId'));
    }
    if (!key.startsWith('Week:')) {
      throw ImportListSaves.unreadable();
    }
    return writer.keys.of(key);
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
    return withRows(grid, raw);
  }

  /**
   * A special day's grid (INGEST-4.3): its time blocks are its own (ids local to its plan, ADR
   * 0014 choice 6), kept as sent; groups and items by their records' Ids.
   */
  public ScheduleGrid specialDayGrid(Map<String, Object> raw) {
    ScheduleGrid grid = new ScheduleGrid();
    for (List<String> b : tuples(raw.get('b'))) {
      grid.blocks.add(new ScheduleGrid.Block(b[0], b[1]).at(b[2], b[3]));
    }
    return withRows(grid, raw);
  }

  private ScheduleGrid withRows(ScheduleGrid grid, Map<String, Object> raw) {
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
