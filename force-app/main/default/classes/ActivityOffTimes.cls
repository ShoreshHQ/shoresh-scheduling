/**
 * When an activity can run (ADR 0031 piece A): the boxes of its details panel's "When it runs"
 * grid (each program's days by its time blocks) that the director unticked, one
 * ActivityOffTime__c row each. Nothing stored means it can run whenever its groups are at camp,
 * and a time block or day added later is open until someone says otherwise. A box is said as
 * "<time block Id>|<weekday>" (the weekday as stored, Monday to Sunday, also in a numbered-days
 * season: ADR 0025 choice 2), the same key the screen and the engine use.
 */
public with sharing class ActivityOffTimes {
  private static final String SEPARATOR = '|';

  /** One box: "<time block Id>|Monday". */
  public static String key(Id blockId, String weekday) {
    return String.valueOf(blockId) + SEPARATOR + weekday;
  }

  /** The boxes unticked on a read activity (its OffTimes__r rows, SeasonSetupReader). */
  public static Set<String> of(Activity__c activity) {
    Set<String> result = new Set<String>();
    for (ActivityOffTime__c row : activity.OffTimes__r) {
      if (row.TimeBlock__c != null && row.Day__c != null) {
        result.add(key(row.TimeBlock__c, row.Day__c));
      }
    }
    return result;
  }

  /** Whether a read activity can run in this time block on this date's weekday. */
  public static Boolean runs(Activity__c activity, Id blockId, Date day) {
    return activity == null ||
      blockId == null ||
      day == null ||
      !of(activity).contains(key(blockId, WeekCalendar.weekdayName(day)));
  }

  /** The boxes unticked now, in a fixed order (time block Id, then weekday). */
  public static List<String> now(Id activityId) {
    List<String> result = new List<String>();
    for (ActivityOffTime__c row : [
      SELECT TimeBlock__c, Day__c
      FROM ActivityOffTime__c
      WHERE Activity__c = :activityId AND TimeBlock__c != NULL
      WITH USER_MODE
      ORDER BY TimeBlock__c, Day__c
    ]) {
      result.add(key(row.TimeBlock__c, row.Day__c));
    }
    return result;
  }

  /** Whether two lists of boxes say the same boxes, in any order. */
  public static Boolean same(List<String> a, List<String> b) {
    return new Set<String>(a ?? new List<String>())
      .equals(new Set<String>(b ?? new List<String>()));
  }

  /**
   * The rows for these boxes (each once). A box that isn't a time block and a weekday is
   * refused in the panel's words; a time block of another season is refused by its trigger.
   */
  public static List<ActivityOffTime__c> rows(Id activityId, List<String> boxes) {
    List<ActivityOffTime__c> result = new List<ActivityOffTime__c>();
    for (String box : new Set<String>(boxes ?? new List<String>())) {
      Id blockId = blockOf(box);
      String weekday = String.isBlank(box) ? null : box.substringAfter(SEPARATOR);
      if (blockId == null || WeekCalendar.indexOfWeekday(weekday) < 0) {
        throw new ShoreshException(
          'When it runs can only name days and time blocks of this season.'
        );
      }
      result.add(
        new ActivityOffTime__c(
          Activity__c = activityId,
          TimeBlock__c = blockId,
          Day__c = weekday
        )
      );
    }
    return result;
  }

  private static Id blockOf(String box) {
    try {
      Id blockId = Id.valueOf(box.substringBefore(SEPARATOR));
      return blockId.getSObjectType() == TimeBlock__c.SObjectType
        ? blockId
        : null;
    } catch (Exception e) {
      return null;
    }
  }

  /**
   * Saves the boxes unticked (the panel's When it runs, and change_activity_details), all of
   * them, only while the activity's boxes are still as the person saw them (seen; ADR 0011 choice
   * 5): someone else's change since is answered (theirOffTimes), not overwritten, and nothing is
   * saved. Someone else having chosen the same is no question. The activity is held until the
   * request ends, so no one changes it between compare and save.
   */
  public static RowSaves.Result save(
    Id activityId,
    List<String> boxes,
    List<String> seen
  ) {
    if (activityId == null) {
      throw new ShoreshException('Save the new row in the table first.');
    }
    if (seen == null) {
      throw new ShoreshException(
        'When it runs' +
        AgentRefusal.say(
          ' wasn\'t saved: reload the page and change it again.',
          ' wasn\'t saved.'
        )
      );
    }
    List<ActivityOffTime__c> wanted = rows(activityId, boxes);
    List<Activity__c> held = [
      SELECT Id
      FROM Activity__c
      WHERE Id = :activityId
      WITH USER_MODE
      FOR UPDATE
    ];
    if (held.isEmpty()) {
      throw new ShoreshException(
        'That was not found, or you do not have access to it.'
      );
    }
    RowSaves.Result result = new RowSaves.Result();
    List<String> now = now(activityId);
    if (!same(seen, now) && !same(boxes, now)) {
      result.theirOffTimes = now;
      return result;
    }
    replace(activityId, wanted);
    result.id = activityId;
    return result;
  }

  /** Puts these rows in place of the activity's own (all of them, blank time blocks too). */
  public static void replace(Id activityId, List<ActivityOffTime__c> rows) {
    Database.delete(
      [
        SELECT Id
        FROM ActivityOffTime__c
        WHERE Activity__c = :activityId
        WITH USER_MODE
      ],
      true,
      AccessLevel.USER_MODE
    );
    Database.insert(rows, AccessLevel.USER_MODE);
  }
}
