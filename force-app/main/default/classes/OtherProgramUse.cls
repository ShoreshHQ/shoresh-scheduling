/**
 * Other programs at this season's places and activities during one week (Greg's decision 6, ADR
 * 0010 G5): how many of their groups are at each place, and doing each activity, at a date and
 * clock time. Generated Schedule's engine and both schedules' checks count them against a
 * place's groups that fit and an activity's groups at once (c/shoreshEngine, `otherPrograms`).
 *
 * For each other program of the season and each day of the week: its PUBLISHED schedule's cells
 * when it has one for that day, fixed and recurring activities included as placed there
 * (OtherProgramGrids); otherwise its fixed and recurring activities where setup puts them
 * (OtherProgramSetTime). Drafts and versions never count. A group away that week, a place closed
 * that week, and a fixed or recurring activity off that week don't count. Each entry is one time
 * block's real start and end, since programs keep their own time grids.
 *
 * A fixed, small number of queries in user mode (at most four), whatever the number of
 * programs: one when the season has no other program.
 */
public with sharing class OtherProgramUse {
  public final Week__c week;
  // Groups away, places closed, and fixed or recurring activities off this week.
  private final Set<Id> offThisWeek = new Set<Id>();
  // "date|start|end|place|activity" -> its entry.
  private final Map<String, Entry> entries = new Map<String, Entry>();
  // An activity, or an other program's fixed or recurring activity -> its name, as this user
  // reads it (one that can't be read has none).
  private final Map<Id, String> names = new Map<Id, String>();

  public class Entry {
    @AuraEnabled
    public Date dateValue;
    // "HH:mm"
    @AuraEnabled
    public String startTime;
    @AuraEnabled
    public String endTime;
    @AuraEnabled
    public Id locationId;
    @AuraEnabled
    public Id activityId;
    @AuraEnabled
    public Integer groups = 0;
    // What their groups are doing there, for the dot's words ("Pool in use by Teen swim"): an
    // activity's name, or the fixed and recurring activities' at that place and time. Nothing
    // for one the user can't read.
    @AuraEnabled
    public List<String> names = new List<String>();
  }

  /**
   * week: Id, StartDate__c, EndDate__c. exceptions: the week's exceptions with Group__c,
   * Location__c, FixedActivity__c and RecurringActivity__c (exceptionsOf).
   */
  public OtherProgramUse(Week__c week, List<WeekException__c> exceptions) {
    this.week = week;
    for (WeekException__c mark : exceptions) {
      offThisWeek.add(mark.Group__c);
      offThisWeek.add(mark.Location__c);
      offThisWeek.add(mark.FixedActivity__c);
      offThisWeek.add(mark.RecurringActivity__c);
    }
    offThisWeek.remove(null);
  }

  /** This week's exceptions, as the constructor needs them (Generated has them already). */
  public static List<WeekException__c> exceptionsOf(Id weekId) {
    return [
      SELECT Id, Group__c, Location__c, FixedActivity__c, RecurringActivity__c
      FROM WeekException__c
      WHERE Week__c = :weekId
      WITH USER_MODE
      ORDER BY Id
    ];
  }

  /**
   * The other programs' use of places and activities in the week, in date, time, place and
   * activity order. program: Id and Season__c. activities: the season's, with Location__c.
   */
  public List<Entry> read(Program__c program, List<Activity__c> activities) {
    Map<Id, Program__c> others = new Map<Id, Program__c>(
      [
        SELECT
          Id,
          Monday__c,
          Tuesday__c,
          Wednesday__c,
          Thursday__c,
          Friday__c,
          Saturday__c,
          Sunday__c,
          (
            SELECT Id, StartTime__c, EndTime__c, PartOfDay__c
            FROM TimeBlocks__r
            ORDER BY StartTime__c, SortOrder__c, Id
          ),
          (
            SELECT Id, Name, TimeBlock__c, Length__c, Location__c
            FROM FixedActivities__r
            WHERE Location__c != NULL
            ORDER BY Id
          ),
          (
            SELECT
              Id,
              Name,
              TimeBlock__c,
              Length__c,
              Location__c,
              Monday__c,
              Tuesday__c,
              Wednesday__c,
              Thursday__c,
              Friday__c,
              Saturday__c,
              Sunday__c
            FROM RecurringActivities__r
            WHERE Location__c != NULL
            ORDER BY Id
          )
        FROM Program__c
        WHERE Season__c = :program.Season__c AND Id != :program.Id
        WITH USER_MODE
        ORDER BY Id
      ]
    );
    if (others.isEmpty()) {
      return new List<Entry>();
    }
    readNames(activities, others);
    Set<String> published = new OtherProgramGrids(
        this,
        placesOf(activities, others)
      )
      .add(others.keySet());
    new OtherProgramSetTime(this, published).add(others);
    return sorted();
  }

  /**
   * Where each activity, and each other program's fixed or recurring activity, takes place (Ids
   * never repeat across objects, so one map holds both).
   */
  private static Map<Id, Id> placesOf(
    List<Activity__c> activities,
    Map<Id, Program__c> others
  ) {
    Map<Id, Id> places = new Map<Id, Id>();
    for (Activity__c activity : activities) {
      places.put(activity.Id, activity.Location__c);
    }
    for (Program__c other : others.values()) {
      for (FixedActivity__c item : other.FixedActivities__r) {
        places.put(item.Id, item.Location__c);
      }
      for (RecurringActivity__c item : other.RecurringActivities__r) {
        places.put(item.Id, item.Location__c);
      }
    }
    return places;
  }

  /** The names of the activities and of the other programs' fixed and recurring activities. */
  private void readNames(
    List<Activity__c> activities,
    Map<Id, Program__c> others
  ) {
    for (Activity__c activity : activities) {
      names.put(activity.Id, activity.Name);
    }
    for (Program__c other : others.values()) {
      for (FixedActivity__c item : other.FixedActivities__r) {
        names.put(item.Id, item.Name);
      }
      for (RecurringActivity__c item : other.RecurringActivities__r) {
        names.put(item.Id, item.Name);
      }
    }
  }

  /** Adds what a record is called to an entry's names, if the user can read it. */
  public void name(Entry entry, Id recordId) {
    String name = names.get(recordId);
    if (String.isNotBlank(name)) {
      addNames(entry, new List<String>{ name });
    }
  }

  /** Adds names an entry doesn't have yet. */
  private static void addNames(Entry entry, List<String> more) {
    for (String name : more) {
      if (!entry.names.contains(name)) {
        entry.names.add(name);
      }
    }
  }

  /** Whether a group is away, a place closed, or a fixed or recurring activity off this week. */
  public Boolean isOff(Id recordId) {
    return offThisWeek.contains(recordId);
  }

  /** An entry for a time block on a day, with no place, activity or groups yet. */
  public static Entry at(Date day, String startTime, String endTime) {
    Entry entry = new Entry();
    entry.dateValue = day;
    entry.startTime = startTime;
    entry.endTime = endTime;
    return entry;
  }

  /** Counts an entry's groups, added to any entry already there for the same time and place. */
  public void add(Entry entry) {
    if (
      entry.groups <= 0 ||
      (entry.locationId == null &&
      entry.activityId == null) ||
      String.isBlank(entry.startTime) ||
      String.isBlank(entry.endTime)
    ) {
      return;
    }
    String key = String.join(
      new List<String>{
        String.valueOf(entry.dateValue),
        entry.startTime,
        entry.endTime,
        entry.locationId == null ? '' : String.valueOf(entry.locationId),
        entry.activityId == null ? '' : String.valueOf(entry.activityId)
      },
      '|'
    );
    if (entries.containsKey(key)) {
      Entry there = entries.get(key);
      there.groups += entry.groups;
      addNames(there, entry.names);
    } else {
      entries.put(key, entry);
    }
  }

  /** In date, time, place and activity order: the same week always gives the same list. */
  private List<Entry> sorted() {
    List<String> keys = new List<String>(entries.keySet());
    keys.sort();
    List<Entry> result = new List<Entry>();
    for (String key : keys) {
      Entry entry = entries.get(key);
      entry.names.sort();
      result.add(entry);
    }
    return result;
  }
}
