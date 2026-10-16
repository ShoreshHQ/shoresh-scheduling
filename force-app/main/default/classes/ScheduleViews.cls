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
  }

  public class ScheduleView {
    @AuraEnabled
    public VersionRow schedule;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public List<DayView> days = new List<DayView>();
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
      SELECT Id, Name, Origin__c, VersionReason__c, CreatedDate
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
    List<Schedule__c> found = [
      SELECT Id, Name, Status__c, Origin__c, VersionReason__c, CreatedDate
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
    Set<String> stillThere = ScheduleRefs.stillThere(days);
    for (ScheduleDays.DayGrid day : days) {
      view.days.add(dayView(day, stillThere));
    }
    return view;
  }

  private static VersionRow row(Schedule__c schedule) {
    VersionRow row = new VersionRow();
    row.id = schedule.Id;
    row.name = schedule.Name;
    row.origin = schedule.Origin__c;
    row.reason = schedule.VersionReason__c;
    row.savedAt = schedule.CreatedDate;
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
