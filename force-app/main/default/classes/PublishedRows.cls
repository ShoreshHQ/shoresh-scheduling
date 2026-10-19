/**
 * A week's published schedules as Publish and Unpublish change them (SchedulePublish; ADR 0008
 * part 5): found and locked, the newest of them, and kept as history. Runs in user mode.
 */
public with sharing class PublishedRows {
  /**
   * Every published schedule of the week (one, unless some were made another way), locked until
   * this publish or unpublish ends. Salesforce allows no ORDER BY with a lock, so the newest is found here.
   */
  public static List<Schedule__c> locked(Id programId, Id weekId) {
    return [
      SELECT
        Id,
        Name,
        PublishedAt__c,
        PublishedBy__r.Name,
        Origin__c,
        CreatedDate
      FROM Schedule__c
      WHERE
        Program__c = :programId
        AND Week__c = :weekId
        AND Status__c = :SchedulePublish.PUBLISHED
      WITH USER_MODE
      LIMIT 200
      FOR UPDATE
    ];
  }

  /** The newest of them (latest made; the higher Id on a tie), or null for none. */
  public static Schedule__c newest(List<Schedule__c> schedules) {
    Schedule__c result = null;
    for (Schedule__c schedule : schedules) {
      if (
        result == null ||
        schedule.CreatedDate > result.CreatedDate ||
        (schedule.CreatedDate == result.CreatedDate &&
        String.valueOf(schedule.Id).compareTo(String.valueOf(result.Id)) > 0)
      ) {
        result = schedule;
      }
    }
    return result;
  }

  /**
   * The week's published schedules become history: versions that keep when they were published,
   * and give up the key. One still named as Publish named it (publishedName, the camp's word) is
   * named by when it was published (Greg, 2026-10-19): "Published Oct 18, 2:40 PM". One someone
   * renamed keeps their name. Within PublishedGuard.allow().
   */
  public static void keepAsHistory(
    List<Schedule__c> published,
    String publishedName
  ) {
    List<Schedule__c> history = new List<Schedule__c>();
    for (Schedule__c old : published) {
      // One published before publishing was built (Status only) keeps when it was made.
      Datetime publishedAt = old.PublishedAt__c == null
        ? old.CreatedDate
        : old.PublishedAt__c;
      Schedule__c kept = new Schedule__c(
        Id = old.Id,
        Status__c = ManualVersions.VERSION,
        PublishedAt__c = publishedAt,
        PublishKey__c = null
      );
      if (old.Name == publishedName) {
        kept.Name = historyName(publishedAt);
      }
      history.add(kept);
    }
    Database.update(history, AccessLevel.USER_MODE);
  }

  /**
   * "Published Oct 18, 2:40 PM": when it was published, in the user's time zone, as the screen
   * shows "Published Oct 18, 2:40 PM" beside Publish (short month, day, hour and minutes; a
   * 24-hour clock where the user's locale uses one). The same moment always gives the same name.
   */
  public static String historyName(Datetime publishedAt) {
    // The user's locale writes 1 PM as "13" only on a 24-hour clock.
    Boolean twentyFourHour = Datetime.newInstance(2000, 1, 1, 13, 5, 0)
      .format()
      .contains('13');
    return 'Published ' +
      publishedAt.format(twentyFourHour ? 'MMM d, H:mm' : 'MMM d, h:mm a');
  }

  /**
   * Still named as it was kept (historyName, in this user's time zone and locale): the name
   * already says it was published and when, so Versions and Start from another week don't say it
   * again. One someone renamed, or kept for someone in another time zone, is not.
   */
  public static Boolean namedByPublish(Schedule__c schedule) {
    return schedule.PublishedAt__c != null &&
      schedule.Name == historyName(schedule.PublishedAt__c);
  }
}
