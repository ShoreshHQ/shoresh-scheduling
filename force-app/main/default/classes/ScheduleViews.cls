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
    // Each day's revision as read (ScheduleDays.stamp): sent back by Restore.
    @AuraEnabled
    public String revisions;
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
    List<VersionRow> rows = new List<VersionRow>();
    for (Schedule__c schedule : [
      SELECT Id, Name, Origin__c, VersionReason__c, PublishedAt__c, CreatedDate
      FROM Schedule__c
      WHERE
        Program__c = :programId
        AND Week__c = :weekId
        AND Status__c = 'Version'
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 1000
    ]) {
      rows.add(row(schedule));
    }
    return rows;
  }

  /** One schedule with its days, or null if it is not there (or not visible). */
  public static ScheduleView open(Id scheduleId) {
    return open(scheduleId, null);
  }

  /**
   * The same, with what still counts as there given (Generated Schedule: the program's setup,
   * as GeneratedInputs reads it), or null to look each record up (ScheduleRefs).
   */
  public static ScheduleView open(Id scheduleId, Set<String> stillThere) {
    List<Schedule__c> found = [
      SELECT
        Id,
        Name,
        Status__c,
        Origin__c,
        VersionReason__c,
        PublishedAt__c,
        CreatedDate
      FROM Schedule__c
      WHERE Id = :scheduleId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      return null;
    }
    ScheduleView view = new ScheduleView();
    view.schedule = row(found[0]);
    view.status = found[0].Status__c;
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(scheduleId);
    view.revisions = ScheduleDays.stamp(days);
    view.days = dayViews(
      days,
      stillThere == null ? ScheduleRefs.stillThere(days) : stillThere
    );
    return view;
  }

  /** Days as the screens show them, with anything deleted since marked gone. */
  public static List<DayView> dayViews(List<ScheduleDays.DayGrid> days) {
    return dayViews(days, ScheduleRefs.stillThere(days));
  }

  /** The same, with the records still there already known (their Ids). */
  public static List<DayView> dayViews(
    List<ScheduleDays.DayGrid> days,
    Set<String> stillThere
  ) {
    List<DayView> views = new List<DayView>();
    for (ScheduleDays.DayGrid day : days) {
      views.add(dayView(day, stillThere));
    }
    return views;
  }

  private static VersionRow row(Schedule__c schedule) {
    VersionRow row = new VersionRow();
    row.id = schedule.Id;
    row.name = schedule.Name;
    row.origin = schedule.Origin__c;
    row.reason = schedule.VersionReason__c;
    row.savedAt = schedule.CreatedDate;
    row.publishedAt = schedule.PublishedAt__c;
    row.namedByPublish = PublishedRows.namedByPublish(schedule);
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
      ref.gone = ScheduleGridRules.SET_UP_KINDS.contains(item.kind) && ref.gone;
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
