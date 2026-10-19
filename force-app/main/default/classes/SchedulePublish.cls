/**
 * Publish (Greg, Manual Build round 1 #1 and round 2 #4; wiki decision 0002; ADR 0008 part 5):
 * a draft is copied as its week's one published schedule, the schedule other systems read.
 * Publishing again replaces it: the one it replaces becomes a version (it keeps PublishedAt__c,
 * so it stays history and can't be deleted), and the new one takes PublishKey__c, which
 * Salesforce keeps unique per program and week. Later edits to the draft don't touch the copy.
 * Unpublish (Greg, 2026-10-18) turns the published schedule into such a version, leaving the
 * week with none. Only these (and rename) change published history (PublishedGuard).
 *
 * Works on any locked draft (Manual Build's and Generated Schedule's): the caller locks
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
    // The screen it was published from, as its Origin__c records it (Greg, 2026-10-19): 'Manual'
    // (Manual Build) or 'Generated' (Generated Schedule); null for one published before Origin.
    @AuraEnabled
    public String origin;
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

  /**
   * The week's published schedule beside a Manual Build draft (its Id, Program__c and Week__c)
   * by the names its screen shows (ManualBuildNamesNow), or null when the week has none (the
   * draft is then not read).
   */
  public static PublishState stateOf(
    Schedule__c draft,
    ManualBuildNamesNow shownBy
  ) {
    Schedule__c published = publishedOf(draft.Program__c, draft.Week__c);
    if (published == null) {
      return null;
    }
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(draft.Id);
    shownBy.applyTo(days);
    return stateBeside(published, days);
  }

  /**
   * The week's published schedule beside the draft's days as the caller already has them (a
   * screen that has just read or saved them), or null when the week has none.
   */
  public static PublishState stateOf(
    Id programId,
    Id weekId,
    List<ScheduleDays.DayGrid> draftDays
  ) {
    Schedule__c published = publishedOf(programId, weekId);
    return published == null ? null : stateBeside(published, draftDays);
  }

  private static PublishState stateBeside(
    Schedule__c published,
    List<ScheduleDays.DayGrid> draftDays
  ) {
    PublishState state = stateFor(published);
    state.changedSince = !same(ScheduleDays.read(published.Id), draftDays);
    return state;
  }

  /** What publishing the locked draft would do now. */
  public static Preview preview(Schedule__c draft) {
    Preview result = new Preview();
    List<ScheduleDays.DayGrid> days = readable(ScheduleDays.read(draft.Id));
    result.revisions = ScheduleDays.stamp(days);
    ManualBuildSetupNow.asShown(draft, days);
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
    ManualBuildSetupNow.asShown(draft, readable(days));
    List<Schedule__c> published = PublishedRows.locked(
      draft.Program__c,
      draft.Week__c
    );
    Schedule__c replaced = PublishedRows.newest(published);
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
   * Unpublish (Greg, 2026-10-18; ADR 0008 part 5): the week has no published schedule any more.
   * The one it had is kept as history exactly as one replaced by publishing again: a version that
   * keeps PublishedAt__c, so it can be restored and renamed but never deleted, and publishing
   * again later works as a first publish. Works on any locked draft, like publish.
   * seenPublishedId: the published schedule the screen showed; the week published or unpublished
   * since: refused, and nothing is written. Draft saves don't refuse it: it doesn't touch the
   * draft.
   */
  public static Result unpublish(Schedule__c draft, Id seenPublishedId) {
    Result result = new Result();
    List<Schedule__c> published = PublishedRows.locked(
      draft.Program__c,
      draft.Week__c
    );
    Schedule__c current = PublishedRows.newest(published);
    if (current == null || current.Id != seenPublishedId) {
      result.publishedChanged = true;
      return result;
    }
    PublishedGuard.allow();
    try {
      PublishedRows.keepAsHistory(published, publishedName(draft));
    } finally {
      PublishedGuard.done();
    }
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
    // Published history changes only here, in Unpublish and in rename.
    PublishedGuard.allow();
    try {
      String name = publishedName(draft);
      PublishedRows.keepAsHistory(replaced, name);
      Schedule__c copy = new Schedule__c(
        Program__c = draft.Program__c,
        Week__c = draft.Week__c,
        Name = name,
        Status__c = PUBLISHED,
        Origin__c = draft.Origin__c,
        SourceSchedule__c = draft.Id,
        PublishedAt__c = Datetime.now(),
        PublishedBy__c = UserInfo.getUserId(),
        PublishKey__c = keyOf(draft.Program__c, draft.Week__c)
      );
      // A Generated week's copy keeps the option it was built with, so restoring it later takes
      // that option back (ADR 0010 §49, §50). Manual Build's locked draft doesn't read it.
      if (draft.Origin__c == GeneratedDrafts.GENERATED) {
        copy.EngineOption__c = draft.EngineOption__c;
      }
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
    } finally {
      PublishedGuard.done();
    }
  }

  /**
   * The name Publish gives the week's published schedule: the camp's word for it. Once replaced
   * or unpublished, one still so named is named by when it was published (PublishedRows).
   */
  private static String publishedName(Schedule__c draft) {
    return CampLabels.forCamp(draft.Program__r.Season__r.Camp__c)
      .singular('PublishedSchedule');
  }

  /** Program and week, as PublishKey__c holds them: one published schedule per week. */
  public static String keyOf(Id programId, Id weekId) {
    return String.valueOf(programId) + ':' + String.valueOf(weekId);
  }

  /** The week's current published schedule (the newest, should there be more), or null. */
  private static Schedule__c publishedOf(Id programId, Id weekId) {
    List<Schedule__c> found = [
      SELECT Id, PublishedAt__c, PublishedBy__r.Name, Origin__c, CreatedDate
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

  private static PublishState stateFor(Schedule__c published) {
    PublishState state = new PublishState();
    state.id = published.Id;
    // One published before publishing was built (Status only) shows when it was made.
    state.publishedAt = published.PublishedAt__c == null
      ? published.CreatedDate
      : published.PublishedAt__c;
    state.publishedBy = published.PublishedBy__r?.Name;
    state.origin = published.Origin__c;
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
