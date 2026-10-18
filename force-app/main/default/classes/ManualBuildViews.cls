/**
 * What the Manual Build screen needs besides the draft itself: the season's activities to place
 * (with the groups each is not set up for), and the slots where a group is not at camp (a
 * morning-only or afternoon-only group). Worked out from today's setup. Runs in user mode.
 */
public with sharing class ManualBuildViews {
  public class DraftView {
    @AuraEnabled
    public ScheduleViews.ScheduleView schedule;
    @AuraEnabled
    public List<ActivityOption> activities = new List<ActivityOption>();
    @AuraEnabled
    public List<AwaySlots> away = new List<AwaySlots>();
    // Only just after Start a blank week: fixed or recurring activities whose slot was taken
    // ("Rest · Bunk 3 · Monday").
    @AuraEnabled
    public List<String> notPlaced = new List<String>();
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
    // checks know an activity added since the setup was read.
    @AuraEnabled
    public Activity__c record;
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
    List<Schedule__c> found = [
      SELECT Program__c, Program__r.Season__c
      FROM Schedule__c
      WHERE Id = :scheduleId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      throw new ShoreshException(
        'That schedule was not found, or you do not have access to it.'
      );
    }
    Schedule__c schedule = found[0];
    DraftView view = new DraftView();
    view.schedule = ScheduleViews.open(scheduleId);
    List<Group__c> groups = ProgramReads.groupsOf(schedule.Program__c);
    view.activities = options(schedule.Program__r.Season__c, groups);
    view.away = away(groups, ProgramReads.blocksOf(schedule.Program__c));
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
