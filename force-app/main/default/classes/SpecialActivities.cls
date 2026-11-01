/**
 * Activities named inside a special day's or event's schedule (ADR 0014 choice 15), typed into a
 * cell ("Add <name> to activities") or read from an imported file: the season's activity of that
 * name (spaces and capitals aside), or a new one. A new one is set to 0 times a week, so it is
 * kept for special days and events and Generated Schedule never places it in a regular week
 * (desktop: an activity created inside a special day is a one-off, not a reusable one). The
 * season is locked first, the order imports lock in, so two people adding the same new name at
 * once get one activity. Runs in user mode.
 */
public with sharing class SpecialActivities {
  public static final Integer NAME_LIMIT = 80;

  /** Each name's activity, by its loose name (looseName); added lists the names made new, in order. */
  public class Named {
    public Map<String, Activity__c> byName = new Map<String, Activity__c>();
    public List<String> added = new List<String>();
    /** The season's fixed and recurring activities by loose name, where a file names one. */
    public Map<String, ScheduleGrid.Item> setTimes = new Map<String, ScheduleGrid.Item>();
  }

  /**
   * SPECIAL-2.2: the season's fixed and recurring activities by loose name, each as the item a
   * special day's grid holds it by (as SpecialDayStart brings one in), fixed first, then by
   * program and order; the first of a name wins, so the same setup gives the same item.
   */
  public static Map<String, ScheduleGrid.Item> setTimeItems(Id seasonId) {
    Map<String, ScheduleGrid.Item> result = new Map<String, ScheduleGrid.Item>();
    for (FixedActivity__c fixed : [
      SELECT Id, Name
      FROM FixedActivity__c
      WHERE Program__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Program__r.Name, SortOrder__c NULLS LAST, Name, Id
    ]) {
      putOnce(result, new ScheduleGrid.Item('F', fixed.Id, fixed.Name));
    }
    for (RecurringActivity__c recurring : [
      SELECT Id, Name
      FROM RecurringActivity__c
      WHERE Program__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Program__r.Name, SortOrder__c NULLS LAST, Name, Id
    ]) {
      putOnce(result, new ScheduleGrid.Item('R', recurring.Id, recurring.Name));
    }
    return result;
  }

  private static void putOnce(
    Map<String, ScheduleGrid.Item> items,
    ScheduleGrid.Item item
  ) {
    String key = looseName(item.name);
    if (!items.containsKey(key)) {
      items.put(key, item);
    }
  }

  public static Named named(Id seasonId, List<String> names) {
    lockSeason(seasonId);
    Named result = new Named();
    Map<String, Activity__c> byKey = new Map<String, Activity__c>();
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
      String key = looseName(activity.Name);
      if (!byKey.containsKey(key)) {
        byKey.put(key, activity);
      }
    }
    List<Activity__c> toAdd = new List<Activity__c>();
    for (String name : names) {
      String key = looseName(name);
      if (!byKey.containsKey(key)) {
        Activity__c activity = newActivity(seasonId, name);
        byKey.put(key, activity);
        toAdd.add(activity);
        result.added.add(name);
      }
    }
    if (!toAdd.isEmpty()) {
      UserModeWrites.save(toAdd);
    }
    for (String name : names) {
      result.byName.put(looseName(name), byKey.get(looseName(name)));
    }
    return result;
  }

  /** "Add <name>": the activity as the editor offers it. */
  public static ManualBuildViews.ActivityOption add(Id seasonId, String name) {
    String trimmed = checkedName(name);
    Activity__c activity = named(seasonId, new List<String>{ trimmed })
      .byName.get(looseName(trimmed));
    ManualBuildViews.ActivityOption option = new ManualBuildViews.ActivityOption();
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
    return option;
  }

  /** The name tidied, or refused when it is blank or too long. */
  public static String checkedName(String name) {
    String trimmed = name == null ? '' : name.normalizeSpace();
    if (trimmed.length() == 0) {
      throw new ShoreshException('Type a name first.');
    }
    if (trimmed.length() > NAME_LIMIT) {
      throw new ShoreshException(
        'Keep the name to ' + NAME_LIMIT + ' characters or fewer.'
      );
    }
    return trimmed;
  }

  public static String looseName(String name) {
    return name == null ? '' : name.deleteWhitespace().toLowerCase();
  }

  private static Activity__c newActivity(Id seasonId, String name) {
    return new Activity__c(
      Season__c = seasonId,
      Name = name,
      Length__c = 1,
      TimesPerWeekMin__c = 0,
      TimesPerWeekMax__c = 0,
      NoWeeklyMax__c = false,
      Priority__c = 'Low',
      Outdoor__c = false,
      GroupsAtOnce__c = 1,
      NoGroupLimit__c = false
    );
  }

  private static void lockSeason(Id seasonId) {
    if (
      [
          SELECT Id
          FROM Season__c
          WHERE Id = :seasonId
          WITH USER_MODE
          FOR UPDATE
        ]
        .isEmpty()
    ) {
      throw new ShoreshException(
        'That was not found, or you don\'t have access to it. Reload the page.'
      );
    }
  }
}
