/**
 * What the Manual Build screen needs besides the draft itself: the season's activities to place
 * (with the groups each is not set up for), and the slots where a group is not at camp (a
 * morning-only or afternoon-only group), and other programs' use of places and activities that
 * week. Worked out from today's setup. Runs in user mode.
 */
public with sharing class ManualBuildViews {
  public class DraftView {
    @AuraEnabled
    public ScheduleViews.ScheduleView schedule;
    @AuraEnabled
    public List<ActivityOption> activities = new List<ActivityOption>();
    @AuraEnabled
    public List<AwaySlots> away = new List<AwaySlots>();
    // The season's activity and location records, as the setup screen reads them
    // (SeasonSetupReader), read with the week so the screen's checks are as fresh as it is.
    @AuraEnabled
    public List<Activity__c> activityRecords = new List<Activity__c>();
    @AuraEnabled
    public List<Location__c> locationRecords = new List<Location__c>();
    // The program's groups (with their divisions) and where its fixed and recurring activities
    // take place, read with the week too, for the checks that compare divisions and places.
    @AuraEnabled
    public List<Group__c> groupRecords = new List<Group__c>();
    @AuraEnabled
    public List<FixedActivity__c> fixedActivityRecords = new List<FixedActivity__c>();
    @AuraEnabled
    public List<RecurringActivity__c> recurringActivityRecords = new List<RecurringActivity__c>();
    // Other programs' groups at the season's places and activities this week, for the checks
    // (OtherProgramUse; the same as Generated Schedule's engine counts).
    @AuraEnabled
    public List<OtherProgramUse.Entry> otherPrograms = new List<OtherProgramUse.Entry>();
    // Only just after Start a blank week: fixed or recurring activities whose slot was taken
    // ("Rest · Bunk 3 · Monday").
    @AuraEnabled
    public List<String> notPlaced = new List<String>();
    // Only just after Start from another week: what the other week had that couldn't go
    // ("Swim · Bunk 3 · Monday: not at camp then").
    @AuraEnabled
    public List<String> leftOut = new List<String>();
    // Only just after Start from another week: someone else had started the week first, so
    // theirs is shown and nothing was copied.
    @AuraEnabled
    public Boolean startedBySomeoneElse = false;
    // Only from a refused Restore: someone saved a day since the screen read the week, so
    // nothing changed (the rest of this view is empty).
    @AuraEnabled
    public Boolean changedSince = false;
  }

  public class ActivityOption {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    // How many time blocks one session runs.
    @AuraEnabled
    public Integer length;
    // Times a week each group should have it: at least minPerWeek (0 when not set), at most
    // maxPerWeek (null when it has no weekly limit).
    @AuraEnabled
    public Integer minPerWeek;
    @AuraEnabled
    public Integer maxPerWeek;
    // Groups it is not set up for (its "who can do it" leaves them out).
    @AuraEnabled
    public List<Id> notFor = new List<Id>();
    // Only from "Add <name>": its setup record (SeasonSetupReader.activitiesOf), so the screen's
    // checks know it at once, before the draft is read again.
    @AuraEnabled
    public Activity__c record;
  }

  /** A schedule a week can start from: another week's Manual Build, or a version. */
  public class WeekSource {
    @AuraEnabled
    public Id id;
    // The week's name ("Week 2").
    @AuraEnabled
    public String weekName;
    // The schedule's name: "Manual Build", or the version's.
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Boolean isVersion;
    @AuraEnabled
    public Datetime savedAt;
  }

  /** The program's other weeks' Manual Build drafts and all its versions, by week, newest first. */
  public static List<WeekSource> weekSources(Id programId, Id weekId) {
    List<WeekSource> result = new List<WeekSource>();
    for (Schedule__c schedule : [
      SELECT Id, Name, Status__c, Origin__c, Week__c, Week__r.Name, CreatedDate
      FROM Schedule__c
      WHERE
        Program__c = :programId
        AND (Status__c = 'Version'
        OR (Status__c = 'Draft'
        AND Origin__c = 'Manual'
        AND Week__c != :weekId))
      WITH USER_MODE
      ORDER BY Week__r.StartDate__c, Status__c, CreatedDate DESC, Id
      LIMIT 1000
    ]) {
      WeekSource source = new WeekSource();
      source.id = schedule.Id;
      source.weekName = schedule.Week__r.Name;
      source.name = schedule.Name;
      source.isVersion = schedule.Status__c == 'Version';
      source.savedAt = schedule.CreatedDate;
      result.add(source);
    }
    return result;
  }

  /** A group and the time blocks it is not at camp for. */
  public class AwaySlots {
    @AuraEnabled
    public Id groupId;
    @AuraEnabled
    public List<Id> blockIds = new List<Id>();
  }

  /** The draft opened for Manual Build. */
  public static DraftView open(Id scheduleId) {
    Schedule__c schedule = draftOf(scheduleId);
    return viewOf(
      schedule,
      ProgramReads.groupsOf(schedule.Program__c),
      ProgramReads.blocksOf(schedule.Program__c)
    );
  }

  /** The same, on the program's groups and time blocks already read in this request. */
  public static DraftView openWith(Id scheduleId, GeneratedSetup setup) {
    return viewOf(draftOf(scheduleId), setup.groups, setup.blocks);
  }

  private static Schedule__c draftOf(Id scheduleId) {
    List<Schedule__c> found = [
      SELECT
        Program__c,
        Program__r.Id,
        Program__r.Season__c,
        Week__c,
        Week__r.StartDate__c,
        Week__r.EndDate__c
      FROM Schedule__c
      WHERE Id = :scheduleId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      throw new ShoreshException(
        'That schedule was not found, or you do not have access to it.'
      );
    }
    return found[0];
  }

  private static DraftView viewOf(
    Schedule__c schedule,
    List<Group__c> groups,
    List<TimeBlock__c> blocks
  ) {
    DraftView view = new DraftView();
    view.schedule = ScheduleViews.open(schedule.Id);
    view.activities = options(schedule.Program__r.Season__c, groups);
    view.activityRecords = SeasonSetupReader.activitiesOf(
      schedule.Program__r.Season__c
    );
    view.locationRecords = SeasonSetupReader.locationsOf(
      schedule.Program__r.Season__c
    );
    view.groupRecords = groups;
    view.fixedActivityRecords = [
      SELECT Id, Location__c
      FROM FixedActivity__c
      WHERE Program__c = :schedule.Program__c
      WITH USER_MODE
      ORDER BY Id
    ];
    view.recurringActivityRecords = [
      SELECT Id, Location__c
      FROM RecurringActivity__c
      WHERE Program__c = :schedule.Program__c
      WITH USER_MODE
      ORDER BY Id
    ];
    view.away = away(groups, blocks);
    view.otherPrograms = new OtherProgramUse(
        new Week__c(
          Id = schedule.Week__c,
          StartDate__c = schedule.Week__r.StartDate__c,
          EndDate__c = schedule.Week__r.EndDate__c
        ),
        OtherProgramUse.exceptionsOf(schedule.Week__c)
      )
      .read(schedule.Program__r, view.activityRecords);
    return view;
  }

  /** The season's activities in the Activities screen's order. */
  public static List<ActivityOption> options(
    Id seasonId,
    List<Group__c> groups
  ) {
    Map<Id, Set<Id>> whoByActivity = whoCanDoIt(seasonId);
    List<ActivityOption> result = new List<ActivityOption>();
    for (Activity__c activity : [
      SELECT
        Id,
        Name,
        Length__c,
        TimesPerWeekMin__c,
        TimesPerWeekMax__c,
        NoWeeklyMax__c
      FROM Activity__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ]) {
      result.add(option(activity, whoByActivity.get(activity.Id), groups));
    }
    return result;
  }

  /** Each activity's "who can do it": the divisions and groups named. */
  private static Map<Id, Set<Id>> whoCanDoIt(Id seasonId) {
    Map<Id, Set<Id>> whoByActivity = new Map<Id, Set<Id>>();
    for (ActivityEligibility__c row : [
      SELECT Activity__c, Division__c, Group__c
      FROM ActivityEligibility__c
      WHERE Activity__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      if (!whoByActivity.containsKey(row.Activity__c)) {
        whoByActivity.put(row.Activity__c, new Set<Id>());
      }
      whoByActivity.get(row.Activity__c).add(row.Division__c);
      whoByActivity.get(row.Activity__c).add(row.Group__c);
    }
    return whoByActivity;
  }

  /** One activity as Manual Build offers it. who: the "who can do it" names, or null for everyone. */
  private static ActivityOption option(
    Activity__c activity,
    Set<Id> who,
    List<Group__c> groups
  ) {
    ActivityOption option = new ActivityOption();
    option.id = activity.Id;
    option.name = activity.Name;
    option.length = activity.Length__c == null
      ? 1
      : Math.max(1, activity.Length__c.intValue());
    option.minPerWeek = activity.TimesPerWeekMin__c == null
      ? 0
      : activity.TimesPerWeekMin__c.intValue();
    option.maxPerWeek = activity.NoWeeklyMax__c ||
      activity.TimesPerWeekMax__c == null
      ? null
      : activity.TimesPerWeekMax__c.intValue();
    for (Group__c grp : who == null ? new List<Group__c>() : groups) {
      if (!who.contains(grp.Id) && !who.contains(grp.Division__c)) {
        option.notFor.add(grp.Id);
      }
    }
    return option;
  }

  private static List<AwaySlots> away(
    List<Group__c> groups,
    List<TimeBlock__c> blocks
  ) {
    List<AwaySlots> result = new List<AwaySlots>();
    for (Group__c grp : groups) {
      AwaySlots slots = new AwaySlots();
      slots.groupId = grp.Id;
      for (TimeBlock__c block : blocks) {
        if (!SetTimePlan.atCamp(grp, block)) {
          slots.blockIds.add(block.Id);
        }
      }
      if (!slots.blockIds.isEmpty()) {
        result.add(slots);
      }
    }
    return result;
  }
}
