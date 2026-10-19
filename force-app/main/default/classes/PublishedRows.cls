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
      SELECT Id, PublishedAt__c, PublishedBy__r.Name, CreatedDate
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
   * and give up the key. Within PublishedGuard.allow().
   */
  public static void keepAsHistory(List<Schedule__c> published) {
    List<Schedule__c> history = new List<Schedule__c>();
    for (Schedule__c old : published) {
      history.add(
        new Schedule__c(
          Id = old.Id,
          Status__c = ManualVersions.VERSION,
          // One published before publishing was built (Status only) keeps when it was made.
          PublishedAt__c = old.PublishedAt__c == null
            ? old.CreatedDate
            : old.PublishedAt__c,
          PublishKey__c = null
        )
      );
    }
    Database.update(history, AccessLevel.USER_MODE);
  }
}
