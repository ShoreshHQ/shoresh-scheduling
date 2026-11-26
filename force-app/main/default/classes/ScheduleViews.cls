/**
 * Schedules shaped for the schedule page: a program's versions for a week, and one schedule
 * opened with its days. A day shows what was saved (names as they were then); anything it
 * points at that has been deleted since is marked gone, so the page can say so. Runs in user
 * mode.
 */
public with sharing class ScheduleViews {
  public class VersionRow {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String origin;
    @AuraEnabled
    public String reason;
    @AuraEnabled
    public Datetime savedAt;
    // When it was the week's published schedule (one replaced since is kept as history), or
    // null for a version that never was.
    @AuraEnabled
    public Datetime publishedAt;
    // Still named by when it was published ("Published Oct 18, 2:40 PM"): PublishedRows.
    @AuraEnabled
    public Boolean namedByPublish;
  }

  public class ScheduleView {
    @AuraEnabled
    public VersionRow schedule;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public List<DayView> days = new List<DayView>();
    // Each day's revision as read (WeekTickets.stamp): sent back by Restore.
    @AuraEnabled
    public String revisions;
    // The special days and events it shows (the Schedules page only, ADR 0014 slice 5): what it
    // carried when it was published, or the week's as they are now. Null on other screens.
    @AuraEnabled
    public ScheduleSpecials.Shown specials;
  }

  public class DayView {
    @AuraEnabled
    public Date dateValue;
    // Why the day could not be read, or null.
    @AuraEnabled
    public String problem;
    @AuraEnabled
    public List<Ref> blocks = new List<Ref>();
    @AuraEnabled
    public List<Ref> groups = new List<Ref>();
    @AuraEnabled
    public List<Ref> items = new List<Ref>();
    // One row per group: its cells separated by commas (the stored format's rows).
    @AuraEnabled
    public List<String> rows = new List<String>();
    // Locked cells (Generated Schedule): one row per group like rows, each cell '1' or empty;
    // no rows when nothing is locked.
    @AuraEnabled
    public List<String> locks = new List<String>();
    // A rainy day's marks (RainMarks, repo docs/adr/0019 choice 9): the cells whose rain plan had
    // no room ("group Id|time block Id|activity Id") and the cells it switched (the same with
    // "|switched" after), each only while it still holds that activity.
    @AuraEnabled
    public List<String> rain = new List<String>();
  }

  /** A time block, group, or item as saved, and whether it has been deleted since. */
  public class Ref {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String kind;
    @AuraEnabled
    public String startTime;
    @AuraEnabled
    public String endTime;
    @AuraEnabled
    public Boolean gone = false;
  }

  /** The program's versions for the week, newest first. */
  public static List<VersionRow> versions(Id programId, Id weekId) {
    return listed(programId, weekId, new List<String>{ 'Version' });
  }

  /**
   * The week's versions and its published schedule, newest first: what the Saved versions page
   * opens, prints and downloads (PUB-6.11). The build screens' Versions keep to versions().
   */
  public static List<VersionRow> versionsAndPublished(Id programId, Id weekId) {
    return listed(
      programId,
      weekId,
      new List<String>{ 'Version', SchedulePublish.PUBLISHED }
    );
  }

  private static List<VersionRow> listed(
    Id programId,
    Id weekId,
    List<String> statuses
  ) {
    List<VersionRow> rows = new List<VersionRow>();
    for (Schedule__c schedule : [
      SELECT Id, Name, Origin__c, VersionReason__c, PublishedAt__c, CreatedDate
      FROM Schedule__c
      WHERE
        Program__c = :programId
        AND Week__c = :weekId
        AND Status__c IN :statuses
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 1000
    ]) {
      rows.add(row(schedule, programId));
    }
    return rows;
  }

  /** One schedule with its days, or null if it is not there (or not visible). */
  public static ScheduleView open(Id scheduleId) {
    return open(scheduleId, null);
  }

  /**
   * The same, with some records already known to be there (Generated Schedule: the program's
   * setup, as GeneratedInputs reads it), or null to look each record up (ScheduleRefs).
   */
  public static ScheduleView open(Id scheduleId, Set<String> stillThere) {
    return openOne(scheduleId, stillThere);
  }

  /**
   * Schedules with their days and the special days and events each shows (ScheduleSpecials), as
   * the Schedules page shows one, in the order asked (null for one not there or not visible),
   * read together: the same few queries however many there are (a week's published programs,
   * AgentWeekView).
   */
  public static List<ScheduleView> openAllWithSpecials(List<Id> scheduleIds) {
    Map<Id, Schedule__c> found = new Map<Id, Schedule__c>(
      schedulesOf(new Set<Id>(scheduleIds))
    );
    Map<Id, List<ScheduleDays.DayGrid>> daysById = ScheduleDays.read(
      found.keySet()
    );
    // What every schedule's days point at, looked for once for all of them.
    List<ScheduleDays.DayGrid> allDays = new List<ScheduleDays.DayGrid>();
    for (List<ScheduleDays.DayGrid> days : daysById.values()) {
      allDays.addAll(days);
    }
    Set<String> there = ScheduleRefs.stillThere(allDays);
    Map<Id, ScheduleSpecials.Shown> specials = ScheduleSpecials.shownAll(
      found.values(),
      daysById
    );
    List<ScheduleView> views = new List<ScheduleView>();
    for (Id scheduleId : scheduleIds) {
      Schedule__c schedule = found.get(scheduleId);
      if (schedule == null) {
        views.add(null);
        continue;
      }
      List<ScheduleDays.DayGrid> days = daysById.get(scheduleId);
      ScheduleView view = viewOf(schedule, days);
      view.days = new List<DayView>();
      for (ScheduleDays.DayGrid day : days) {
        view.days.add(dayView(day, there));
      }
      view.specials = specials.get(scheduleId);
      views.add(view);
    }
    return views;
  }

  private static ScheduleView openOne(Id scheduleId, Set<String> stillThere) {
    List<Schedule__c> found = schedulesOf(new Set<Id>{ scheduleId });
    if (found.isEmpty()) {
      return null;
    }
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(scheduleId);
    ScheduleView view = viewOf(found[0], days);
    view.days = dayViews(days, stillThere);
    return view;
  }

  private static List<Schedule__c> schedulesOf(Set<Id> scheduleIds) {
    return [
      SELECT
        Id,
        Name,
        Status__c,
        Origin__c,
        VersionReason__c,
        PublishedAt__c,
        CreatedDate,
        Week__c,
        Program__c
      FROM Schedule__c
      WHERE Id IN :scheduleIds
      WITH USER_MODE
    ];
  }

  /** The schedule's row, status and the days' revisions (its days are the caller's). */
  private static ScheduleView viewOf(
    Schedule__c schedule,
    List<ScheduleDays.DayGrid> days
  ) {
    ScheduleView view = new ScheduleView();
    view.schedule = row(schedule, schedule.Program__c);
    view.status = schedule.Status__c;
    view.revisions = WeekTickets.stamp(days);
    return view;
  }

  /** Days as the screens show them, with anything deleted since marked gone. */
  public static List<DayView> dayViews(List<ScheduleDays.DayGrid> days) {
    return dayViews(days, ScheduleRefs.stillThere(days));
  }

  /**
   * The same, with some records still there already known (their Ids); any other record a day
   * points at is looked for, so whichever screen asks, a record that exists is never "deleted".
   */
  public static List<DayView> dayViews(
    List<ScheduleDays.DayGrid> days,
    Set<String> stillThere
  ) {
    List<DayView> views = new List<DayView>();
    Set<String> there = ScheduleRefs.stillThere(days, stillThere);
    for (ScheduleDays.DayGrid day : days) {
      views.add(dayView(day, there));
    }
    return views;
  }

  private static VersionRow row(Schedule__c schedule, Id programId) {
    VersionRow row = new VersionRow();
    row.id = schedule.Id;
    row.name = schedule.Name;
    row.origin = schedule.Origin__c;
    row.reason = schedule.VersionReason__c;
    row.savedAt = schedule.CreatedDate;
    row.publishedAt = schedule.PublishedAt__c;
    row.namedByPublish = PublishedRows.namedByPublish(schedule, programId);
    return row;
  }

  private static DayView dayView(
    ScheduleDays.DayGrid day,
    Set<String> stillThere
  ) {
    DayView view = new DayView();
    view.dateValue = day.day;
    view.problem = day.problem;
    if (day.grid == null) {
      return view;
    }
    for (ScheduleGrid.Block block : day.grid.blocks) {
      Ref ref = ref(block.id, block.name, stillThere);
      ref.startTime = block.startTime;
      ref.endTime = block.endTime;
      view.blocks.add(ref);
    }
    for (ScheduleGrid.GroupRef grp : day.grid.groups) {
      view.groups.add(ref(grp.id, grp.name, stillThere));
    }
    for (ScheduleGrid.Item item : day.grid.items) {
      Ref ref = ref(item.id, item.name, stillThere);
      ref.kind = item.kind;
      // Things not set up in Shoresh yet point at nothing, so nothing can be gone.
      ref.gone = ScheduleGridRules.isSetUp(item) && ref.gone;
      view.items.add(ref);
    }
    for (List<String> cells : day.grid.rows) {
      view.rows.add(String.join(cells, ','));
    }
    if (ScheduleGridLocks.hasAny(day.grid)) {
      for (List<String> cells : day.grid.locks) {
        view.locks.add(String.join(cells, ','));
      }
    }
    view.rain = RainMarks.keptOn(day.grid, day.rain);
    return view;
  }

  private static Ref ref(String id, String name, Set<String> stillThere) {
    Ref ref = new Ref();
    ref.id = id;
    ref.name = name;
    ref.gone = !ScheduleRefs.isThere(id, stillThere);
    return ref;
  }
}
