/**
 * Publish (Greg, Manual Build round 1 #1 and round 2 #4; wiki decision 0002; ADR 0008 part 5):
 * a draft is copied as its week's one published schedule, the schedule other systems read.
 * Publishing again replaces it: the one it replaces becomes a version (it keeps PublishedAt__c,
 * so it stays history and can't be deleted), and the new one takes PublishKey__c, which
 * Salesforce keeps unique per program and week. Later edits to the draft don't touch the copy.
 *
 * Works on any locked draft (Manual Build's today; Generated Schedule's next): the caller locks
 * it through its own drafts class, which refuses anything else. A publish names the draft's
 * revisions and the published schedule it was shown (preview), so a week someone changed since,
 * or a schedule someone else published since, is never published or replaced unseen. Runs in
 * user mode.
 */
public with sharing class SchedulePublish {
  public static final String PUBLISHED = 'Published';
  // How many changed cells a preview lists (it counts them all).
  @TestVisible
  private static final Integer MOST_LINES = 30;

  /** The week's published schedule, as a screen shows it beside the draft. */
  public class PublishState {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public Datetime publishedAt;
    // Who published it (their name), or null when that can't be read.
    @AuraEnabled
    public String publishedBy;
    // The draft no longer matches what was published.
    @AuraEnabled
    public Boolean changedSince = false;
  }

  /** What publishing the draft now would do: shown before it is done. */
  public class Preview {
    // The draft's revisions the preview was worked out from: sent back with publish.
    @AuraEnabled
    public String revisions;
    // The published schedule it would replace, or null for the week's first publish.
    @AuraEnabled
    public PublishState published;
    // The lines saying what would change from the published schedule (at most MOST_LINES of
    // them; neighbouring cells with the same change share one), how many cells change in all,
    // and how many lines are not listed.
    @AuraEnabled
    public List<String> changes = new List<String>();
    @AuraEnabled
    public Integer changeCount = 0;
    @AuraEnabled
    public Integer moreLines = 0;
  }

  /** A publish done, or refused because the week or its published schedule changed since. */
  public class Result {
    @AuraEnabled
    public PublishState published;
    // Refused, nothing changed: someone saved the draft since the preview.
    @AuraEnabled
    public Boolean draftChanged = false;
    // Refused, nothing changed: someone published the week since the preview.
    @AuraEnabled
    public Boolean publishedChanged = false;
    // Nothing to do: the published schedule already is the draft as it is.
    @AuraEnabled
    public Boolean unchanged = false;
  }

  /** The week's published schedule beside the draft, or null when the week has none. */
  public static PublishState stateOf(Id programId, Id weekId, Id draftId) {
    Schedule__c published = publishedOf(programId, weekId);
    if (published == null) {
      return null;
    }
    PublishState state = stateFor(published);
    state.changedSince = !same(
      ScheduleDays.read(published.Id),
      ScheduleDays.read(draftId)
    );
    return state;
  }

  /** What publishing the locked draft would do now. */
  public static Preview preview(Schedule__c draft) {
    Preview result = new Preview();
    List<ScheduleDays.DayGrid> days = readable(ScheduleDays.read(draft.Id));
    result.revisions = ScheduleDays.stamp(days);
    Schedule__c published = publishedOf(draft.Program__c, draft.Week__c);
    if (published == null) {
      return result;
    }
    result.published = stateFor(published);
    PublishedChanges.Changes changes = PublishedChanges.between(
      ScheduleDays.read(published.Id),
      days,
      MOST_LINES
    );
    result.changes = changes.lines;
    result.changeCount = changes.count;
    result.moreLines = changes.moreLines;
    result.published.changedSince = changes.count > 0;
    return result;
  }

  /**
   * Publishes the locked draft. seenRevisions: the preview's revisions; seenPublishedId: the
   * published schedule the preview showed (null for none). Either changed since: refused, and
   * nothing is written.
   */
  public static Result publish(
    Schedule__c draft,
    String seenRevisions,
    Id seenPublishedId
  ) {
    // No program lock (a Generated save takes the program, then its draft; this holds the
    // draft already): the published schedule is locked below, and PublishKey__c's uniqueness
    // refuses a second first publish of the week made at the same moment.
    Result result = new Result();
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(draft.Id);
    if (ScheduleDays.stamp(days) != seenRevisions) {
      result.draftChanged = true;
      return result;
    }
    readable(days);
    List<Schedule__c> published = lockedPublished(
      draft.Program__c,
      draft.Week__c
    );
    Schedule__c replaced = newest(published);
    if ((replaced == null ? null : replaced.Id) != seenPublishedId) {
      result.publishedChanged = true;
      return result;
    }
    if (replaced != null && same(ScheduleDays.read(replaced.Id), days)) {
      result.unchanged = true;
      result.published = stateFor(replaced);
      return result;
    }
    if (!wroteCopy(draft, published, days)) {
      // Someone else published the week at the same moment: theirs stands, nothing changed.
      result.publishedChanged = true;
      return result;
    }
    // Read back as the screen will read it later (who published it, by name).
    result.published = stateFor(publishedOf(draft.Program__c, draft.Week__c));
    return result;
  }

  /**
   * The draft's days copied as the week's published schedule, the ones replaced kept as history:
   * all or nothing. False (nothing written) when someone else's publish took the week's key.
   */
  private static Boolean wroteCopy(
    Schedule__c draft,
    List<Schedule__c> replaced,
    List<ScheduleDays.DayGrid> days
  ) {
    Savepoint beforePublish = Database.setSavepoint();
    try {
      // History now: versions that keep when they were published, and give up the key.
      List<Schedule__c> history = new List<Schedule__c>();
      for (Schedule__c old : replaced) {
        history.add(
          new Schedule__c(
            Id = old.Id,
            Status__c = ManualVersions.VERSION,
            PublishKey__c = null
          )
        );
      }
      Database.update(history, AccessLevel.USER_MODE);
      Schedule__c copy = new Schedule__c(
        Program__c = draft.Program__c,
        Week__c = draft.Week__c,
        Name = CampLabels.forCamp(draft.Program__r.Season__r.Camp__c)
          .singular('PublishedSchedule'),
        Status__c = PUBLISHED,
        Origin__c = draft.Origin__c,
        SourceSchedule__c = draft.Id,
        PublishedAt__c = Datetime.now(),
        PublishedBy__c = UserInfo.getUserId(),
        PublishKey__c = keyOf(draft.Program__c, draft.Week__c)
      );
      Database.insert(copy, AccessLevel.USER_MODE);
      List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
      for (ScheduleDays.DayGrid day : days) {
        saves.add(new ScheduleDaySaves.DaySave(day.day, day.grid, null));
      }
      ScheduleDaySaves.write(copy.Id, saves);
      return true;
    } catch (DmlException e) {
      Database.rollback(beforePublish);
      if (e.getDmlType(0) == StatusCode.DUPLICATE_VALUE) {
        return false;
      }
      throw e;
    } catch (Exception e) {
      Database.rollback(beforePublish);
      throw e;
    }
  }

  /** Program and week, as PublishKey__c holds them: one published schedule per week. */
  public static String keyOf(Id programId, Id weekId) {
    return String.valueOf(programId) + ':' + String.valueOf(weekId);
  }

  /** The week's current published schedule (the newest, should there be more), or null. */
  private static Schedule__c publishedOf(Id programId, Id weekId) {
    List<Schedule__c> found = [
      SELECT Id, PublishedAt__c, PublishedBy__r.Name, CreatedDate
      FROM Schedule__c
      WHERE
        Program__c = :programId
        AND Week__c = :weekId
        AND Status__c = :PUBLISHED
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 1
    ];
    return found.isEmpty() ? null : found[0];
  }

  /**
   * Every published schedule of the week (one, unless some were made another way), locked until
   * this publish ends. Salesforce allows no ORDER BY with a lock, so the newest is found here.
   */
  private static List<Schedule__c> lockedPublished(Id programId, Id weekId) {
    return [
      SELECT Id, PublishedAt__c, PublishedBy__r.Name, CreatedDate
      FROM Schedule__c
      WHERE
        Program__c = :programId
        AND Week__c = :weekId
        AND Status__c = :PUBLISHED
      WITH USER_MODE
      LIMIT 200
      FOR UPDATE
    ];
  }

  /** The newest of them (latest made; the higher Id on a tie), or null for none. */
  private static Schedule__c newest(List<Schedule__c> schedules) {
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

  private static PublishState stateFor(Schedule__c published) {
    PublishState state = new PublishState();
    state.id = published.Id;
    // One published before publishing was built (Status only) shows when it was made.
    state.publishedAt = published.PublishedAt__c == null
      ? published.CreatedDate
      : published.PublishedAt__c;
    state.publishedBy = published.PublishedBy__r?.Name;
    return state;
  }

  /** The same cells on the same days (PublishedChanges finds none). */
  private static Boolean same(
    List<ScheduleDays.DayGrid> left,
    List<ScheduleDays.DayGrid> right
  ) {
    return PublishedChanges.between(left, right, 0).count == 0;
  }

  /**
   * Every day, refused if there are none (nothing to publish) or any can't be read (it couldn't
   * be published as it is).
   */
  private static List<ScheduleDays.DayGrid> readable(
    List<ScheduleDays.DayGrid> days
  ) {
    if (days.isEmpty()) {
      throw new ShoreshException(
        'There is nothing to publish yet, so nothing was published.'
      );
    }
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid == null) {
        throw new ShoreshException(
          WeekCalendar.weekdayName(day.day) +
            ' could not be read (' +
            day.problem +
            '), so nothing was published.'
        );
      }
    }
    return days;
  }
}
