/**
 * What a season's week has as published (PUB; API-6.2), for the group and activity schedules
 * going out: each group's things, day by day, from each program's published schedule of the
 * week, as Publish kept it. Drafts and versions are never read (API-4.5). Read in user mode, so
 * a key sees only what its permission set and the camp's sharing let it.
 */
public with sharing class OutgoingPublished {
  /** One thing a group does: one or more time blocks in a row. */
  public class Thing {
    public Date day;
    public String groupName;
    public Integer groupOrder;
    public String block;
    public String startTime;
    public String endTime;
    public String activity;
  }

  /** Every group's things in the week, or refused when nothing in it is published. */
  public static List<Thing> of(Season__c season, String week) {
    OutgoingRows.requireWeek(week);
    Set<Id> published = new Set<Id>();
    for (Schedule__c schedule : [
      SELECT Id, Week__r.Name
      FROM Schedule__c
      WHERE
        Program__r.Season__c = :season.Id
        AND Status__c = :SchedulePublish.PUBLISHED
      WITH USER_MODE
      ORDER BY Program__r.SortOrder__c, Program__r.Name
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
    List<Thing> things = new List<Thing>();
    Map<Id, List<ScheduleDays.DayGrid>> days = ScheduleDays.read(published);
    for (Id scheduleId : published) {
      for (ScheduleDays.DayGrid day : days.get(scheduleId)) {
        if (day.grid != null) {
          addDay(day, things);
        }
      }
    }
    return things;
  }

  private static void addDay(ScheduleDays.DayGrid day, List<Thing> things) {
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
        open.groupOrder = g;
        open.block = grid.blocks[b].name;
        open.startTime = grid.blocks[b].startTime;
        open.endTime = grid.blocks[b].endTime;
        open.activity = item.name;
        things.add(open);
      }
    }
  }
}
