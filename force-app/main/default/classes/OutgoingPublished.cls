/**
 * What a season's week has as published (PUB; API-6.2), for the group and activity schedules
 * going out: each group's things, day by day, from each program's published schedule of the
 * week. Publish makes that schedule as a copy no one edits after, so drafts and versions are
 * never read (API-4.5).
 *
 * The published schedules are found in user mode, so a key reaches only seasons and programs
 * shared with it. Their days are then read in system mode on purpose: a key is given no access to
 * schedule days at all, so it can never read a draft's days through Salesforce's own API, and
 * only the days of schedules it found published are read here.
 */
public with sharing class OutgoingPublished {
  /** One thing a group does: one or more time blocks in a row. */
  public class Thing {
    public Date day;
    public String groupName;
    public String block;
    public String startTime;
    public String endTime;
    public String activity;
  }

  /** Every group's things in the week, day by day, or refused when nothing in it is published. */
  public static List<Thing> of(Season__c season, String week) {
    List<Id> published = publishedIn(season, week);
    // Each day's parts, by schedule in program order, then by day.
    Map<Date, Map<Id, List<ScheduleDay__c>>> parts = new Map<Date, Map<Id, List<ScheduleDay__c>>>();
    for (ScheduleDay__c part : [
      SELECT
        Schedule__c,
        Date__c,
        Part__c,
        Grid__c,
        GridFormatVersion__c,
        Revision__c
      FROM ScheduleDay__c
      WHERE Schedule__c IN :published
      WITH SYSTEM_MODE
      ORDER BY Date__c, Part__c
    ]) {
      if (!parts.containsKey(part.Date__c)) {
        parts.put(part.Date__c, new Map<Id, List<ScheduleDay__c>>());
      }
      Map<Id, List<ScheduleDay__c>> bySchedule = parts.get(part.Date__c);
      if (!bySchedule.containsKey(part.Schedule__c)) {
        bySchedule.put(part.Schedule__c, new List<ScheduleDay__c>());
      }
      bySchedule.get(part.Schedule__c).add(part);
    }
    List<Date> days = new List<Date>(parts.keySet());
    days.sort();
    List<Thing> things = new List<Thing>();
    for (Date day : days) {
      for (Id scheduleId : published) {
        if (parts.get(day).containsKey(scheduleId)) {
          addDay(
            ScheduleDays.readDay(day, parts.get(day).get(scheduleId)),
            things
          );
        }
      }
    }
    return things;
  }

  /** The week's published schedules the user can see, in program order; refused when none. */
  private static List<Id> publishedIn(Season__c season, String week) {
    OutgoingRows.requireWeek(week);
    List<Id> published = new List<Id>();
    for (Schedule__c schedule : [
      SELECT Id, Week__r.Name
      FROM Schedule__c
      WHERE
        Program__r.Season__c = :season.Id
        AND Status__c = :SchedulePublish.PUBLISHED
      WITH USER_MODE
      ORDER BY Program__r.SortOrder__c, Program__r.Name, Id
      LIMIT 1000
    ]) {
      if (OutgoingRows.sameWeek(schedule.Week__r.Name, week)) {
        published.add(schedule.Id);
      }
    }
    if (published.isEmpty()) {
      throw new ShoreshException(
        'Nothing in "' +
          week.left(80) +
          '" is published yet. Schedules go out once a week is published.'
      );
    }
    return published;
  }

  private static void addDay(ScheduleDays.DayGrid day, List<Thing> things) {
    // Shown, never hidden: a day that can't be read stops the week going out without it.
    if (day.grid == null) {
      throw new ShoreshException(
        'The published schedule for ' +
          day.day.format() +
          ' can\'t be read, so this week can\'t go out. Publish the week again.'
      );
    }
    ScheduleGrid grid = day.grid;
    for (Integer g = 0; g < grid.groups.size(); g++) {
      Thing open = null;
      for (Integer b = 0; b < grid.blocks.size(); b++) {
        String cell = b < grid.rows[g].size() ? grid.rows[g][b] : '';
        if (cell == ScheduleGrid.CARRIES_ON && open != null) {
          open.endTime = grid.blocks[b].endTime;
          continue;
        }
        open = null;
        ScheduleGrid.Item item = GridItems.itemAt(grid, g, b);
        if (item == null) {
          continue;
        }
        open = new Thing();
        open.day = day.day;
        open.groupName = grid.groups[g].name;
        open.block = grid.blocks[b].name;
        open.startTime = grid.blocks[b].startTime;
        open.endTime = grid.blocks[b].endTime;
        open.activity = item.name;
        things.add(open);
      }
    }
  }
}
