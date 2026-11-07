/**
 * What a published schedule carries of the week's special days and events (ADR 0014 slice 5,
 * PublishedPlan__c): written by Publish only (PublishedGuard refuses anything else), one record
 * per part of each schedule (the schedule-day format and parts, ADR 0005), one with no plan for a
 * special day with no schedule yet; read back as ScheduleSpecials.Special, days in date order,
 * then events by name. Runs in user mode.
 */
public with sharing class SpecialsCarried {
  // Published history never changes (PublishedGuard): what a schedule carries is read once per
  // request however many times it is compared.
  private static Map<Id, List<ScheduleSpecials.Special>> readBefore = new Map<Id, List<ScheduleSpecials.Special>>();

  /** What the schedule carried when it was published (one query); none when it can't be read. */
  public static List<ScheduleSpecials.Special> read(Id scheduleId) {
    if (!Schema.sObjectType.PublishedPlan__c.isAccessible()) {
      return new List<ScheduleSpecials.Special>();
    }
    if (!readBefore.containsKey(scheduleId)) {
      readBefore.put(scheduleId, readNow(scheduleId));
    }
    return readBefore.get(scheduleId);
  }

  private static List<ScheduleSpecials.Special> readNow(Id scheduleId) {
    List<PublishedPlan__c> rows = new List<PublishedPlan__c>();
    for (PublishedPlan__c part : [
      SELECT
        Name,
        Kind__c,
        Item__c,
        Date__c,
        Notes__c,
        Part__c,
        Plan__c,
        GridFormatVersion__c,
        Revision__c
      FROM PublishedPlan__c
      WHERE Schedule__c = :scheduleId
      WITH USER_MODE
      ORDER BY Kind__c, Date__c, Name, Item__c, Part__c
    ]) {
      rows.add(part);
    }
    return fromRows(rows);
  }

  /**
   * The special days each published schedule carried, for what goes out (API-6.5): by schedule,
   * then by the day replaced. One query however many schedules; user mode, and a key's permission
   * set gives it these records.
   */
  public static Map<Id, Map<Date, ScheduleSpecials.Special>> daysGoingOut(
    List<Id> scheduleIds
  ) {
    Map<Id, List<PublishedPlan__c>> rowsBySchedule = new Map<Id, List<PublishedPlan__c>>();
    Map<Id, Map<Date, ScheduleSpecials.Special>> days = new Map<Id, Map<Date, ScheduleSpecials.Special>>();
    for (Id scheduleId : scheduleIds) {
      rowsBySchedule.put(scheduleId, new List<PublishedPlan__c>());
      days.put(scheduleId, new Map<Date, ScheduleSpecials.Special>());
    }
    for (PublishedPlan__c part : [
      SELECT
        Schedule__c,
        Name,
        Kind__c,
        Item__c,
        Date__c,
        Notes__c,
        Part__c,
        Plan__c,
        GridFormatVersion__c,
        Revision__c
      FROM PublishedPlan__c
      WHERE Schedule__c IN :scheduleIds AND Kind__c = :ScheduleSpecials.DAY
      WITH USER_MODE
      ORDER BY Kind__c, Date__c, Name, Item__c, Part__c
    ]) {
      rowsBySchedule.get(part.Schedule__c).add(part);
    }
    for (Id scheduleId : scheduleIds) {
      for (
        ScheduleSpecials.Special special : fromRows(
          rowsBySchedule.get(scheduleId)
        )
      ) {
        days.get(scheduleId).put(special.dateValue, special);
      }
    }
    return days;
  }

  private static List<ScheduleSpecials.Special> fromRows(
    List<PublishedPlan__c> rows
  ) {
    List<ScheduleSpecials.Special> result = new List<ScheduleSpecials.Special>();
    Map<String, List<PublishedPlan__c>> partsByKey = new Map<String, List<PublishedPlan__c>>();
    for (PublishedPlan__c part : rows) {
      ScheduleSpecials.Special special = new ScheduleSpecials.Special();
      special.kind = part.Kind__c;
      special.itemId = part.Item__c;
      special.dateValue = part.Date__c;
      special.name = part.Name;
      special.notes = part.Notes__c;
      String key = special.key();
      if (!partsByKey.containsKey(key)) {
        partsByKey.put(key, new List<PublishedPlan__c>());
        result.add(special);
      }
      partsByKey.get(key).add(part);
    }
    for (ScheduleSpecials.Special special : result) {
      readPlan(special, partsByKey.get(special.key()));
    }
    return result;
  }

  /** Its schedule from its parts, with the schedule-day reader; none when it had none yet. */
  private static void readPlan(
    ScheduleSpecials.Special special,
    List<PublishedPlan__c> parts
  ) {
    if (String.isBlank(parts[0].Plan__c)) {
      return;
    }
    List<ScheduleDay__c> asDays = new List<ScheduleDay__c>();
    for (PublishedPlan__c part : parts) {
      asDays.add(
        new ScheduleDay__c(
          Part__c = part.Part__c,
          Grid__c = part.Plan__c,
          GridFormatVersion__c = part.GridFormatVersion__c,
          Revision__c = part.Revision__c
        )
      );
    }
    ScheduleDays.DayGrid read = ScheduleDays.readDay(special.dateValue, asDays);
    special.grid = read.grid;
    special.problem = read.problem;
  }

  /** Writes what a published copy carries. Called by Publish only, with PublishedGuard allowing it. */
  public static void write(
    Id scheduleId,
    List<ScheduleSpecials.Special> specials
  ) {
    List<PublishedPlan__c> rows = new List<PublishedPlan__c>();
    for (ScheduleSpecials.Special special : specials) {
      List<String> texts = special.grid == null
        ? new List<String>{ null }
        : ScheduleGridParts.split(special.grid);
      for (Integer i = 0; i < texts.size(); i++) {
        PublishedPlan__c row = rowOf(special);
        row.Schedule__c = scheduleId;
        row.Part__c = i + 1;
        row.Plan__c = texts[i];
        rows.add(row);
      }
    }
    if (!rows.isEmpty()) {
      Database.insert(rows, AccessLevel.USER_MODE);
    }
  }

  private static PublishedPlan__c rowOf(ScheduleSpecials.Special special) {
    return new PublishedPlan__c(
      Name = special.name?.left(80),
      Kind__c = special.kind,
      Item__c = special.itemId,
      Date__c = special.dateValue,
      Notes__c = special.notes,
      GridFormatVersion__c = special.grid == null
        ? ScheduleGrid.FORMAT_VERSION
        : ScheduleGridLocks.formatOf(special.grid),
      Revision__c = 1
    );
  }
}
