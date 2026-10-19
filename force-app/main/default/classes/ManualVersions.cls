/**
 * Versions on Manual Build (desktop useSnapshots.js, VersionsDropdown.jsx; ADR 0008 §25): Save
 * version keeps the draft as it is now under a name; Restore copies a version of the same week
 * (from Manual Build or Generated Schedule, Greg's decision 9) into the draft, after keeping the
 * draft as it was as an automatic version ("Before Restore"), the desktop's way back; Delete
 * takes a version away. The draft is locked while any of these runs. Runs in user mode.
 */
public with sharing class ManualVersions {
  public static final String VERSION = 'Version';
  public static final String SAVED_BY_HAND = 'SavedByHand';
  public static final String AUTO_SAVED = 'AutoSaved';
  public static final String BEFORE_RESTORE = 'Before Restore';

  /** Save version: the draft as it is now, kept under a name. Returns the version's Id. */
  public static Id save(Id draftId, String name) {
    Schedule__c draft = ManualDrafts.locked(draftId);
    String named = SchedulesController.checkedName(
      name,
      draft.Program__r.Season__r.Camp__c
    );
    List<ScheduleDays.DayGrid> days = readable(ScheduleDays.read(draftId));
    Id versionId = newVersion(draft, named, SAVED_BY_HAND);
    writeDays(versionId, days);
    return versionId;
  }

  /** Restore refused: someone saved a day of the week since the screen read it. */
  public class ChangedSinceException extends Exception {
  }

  /**
   * Restore: the version's days become the draft's, after the draft as it was is kept as an
   * automatic version. seenRevisions: the week's revisions as the screen showed them
   * (ScheduleView.revisions); if anyone has saved a day since, nothing is changed
   * (ChangedSinceException), so a newer week is never replaced unseen. Returns the kept
   * version's Id (null when the draft had no days to keep).
   */
  public static Id restore(Id draftId, Id versionId, String seenRevisions) {
    Schedule__c draft = ManualDrafts.locked(draftId);
    Schedule__c version = versionOf(versionId, draft);
    List<ScheduleDays.DayGrid> current = ScheduleDays.read(draftId);
    if (ScheduleDays.stamp(current) != seenRevisions) {
      throw new ChangedSinceException();
    }
    List<ScheduleDays.DayGrid> restored = readable(
      ScheduleDays.read(version.Id)
    );
    Savepoint beforeRestore = Database.setSavepoint();
    try {
      Id kept = null;
      if (!current.isEmpty()) {
        kept = newVersion(draft, BEFORE_RESTORE, AUTO_SAVED);
        writeDays(kept, readable(current));
      }
      Map<Date, Integer> revisions = new Map<Date, Integer>();
      for (ScheduleDays.DayGrid day : current) {
        revisions.put(day.day, day.revision);
      }
      List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
      Set<Date> restoredDays = new Set<Date>();
      for (ScheduleDays.DayGrid day : restored) {
        saves.add(
          new ScheduleDaySaves.DaySave(
            day.day,
            day.grid,
            revisions.get(day.day)
          )
        );
        restoredDays.add(day.day);
      }
      ScheduleDaySaves.write(draftId, saves);
      // A day the version doesn't have goes from the draft too: the draft is the version now.
      Database.delete(
        [
          SELECT Id
          FROM ScheduleDay__c
          WHERE Schedule__c = :draftId AND Date__c NOT IN :restoredDays
          WITH USER_MODE
        ],
        true,
        AccessLevel.USER_MODE
      );
      return kept;
    } catch (Exception e) {
      Database.rollback(beforeRestore);
      throw e;
    }
  }

  /**
   * Delete: a version of the draft's week goes for good (its days with it). One that was the
   * week's published schedule once is kept as history (wiki decision 0002), and refused.
   */
  public static void remove(Id draftId, Id versionId) {
    Schedule__c draft = ManualDrafts.locked(draftId);
    Schedule__c version = versionOf(versionId, draft);
    if (version.PublishedAt__c != null) {
      CampLabels labels = CampLabels.forCamp(
        draft.Program__r.Season__r.Camp__c
      );
      throw new ShoreshException(
        '"' +
          version.Name +
          '" was the ' +
          labels.singularInSentence('PublishedSchedule') +
          ', which is kept as history, so it can\'t be deleted.'
      );
    }
    Database.delete(version, true, AccessLevel.USER_MODE);
  }

  /** A version of the draft's program and week, or refused. */
  private static Schedule__c versionOf(Id versionId, Schedule__c draft) {
    List<Schedule__c> found = [
      SELECT Id, Name, Status__c, Program__c, Week__c, PublishedAt__c
      FROM Schedule__c
      WHERE Id = :versionId
      WITH USER_MODE
      FOR UPDATE
    ];
    CampLabels labels = CampLabels.forCamp(draft.Program__r.Season__r.Camp__c);
    if (
      found.isEmpty() ||
      found[0].Status__c != VERSION ||
      found[0].Program__c != draft.Program__c ||
      found[0].Week__c != draft.Week__c
    ) {
      throw new ShoreshException(
        'That ' +
          labels.singularInSentence('Version') +
          ' was not found. It may have been deleted.'
      );
    }
    return found[0];
  }

  /** Every day, refused if any can't be read (it couldn't be copied as it is). */
  private static List<ScheduleDays.DayGrid> readable(
    List<ScheduleDays.DayGrid> days
  ) {
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid == null) {
        throw new ShoreshException(
          'A day could not be read (' +
            day.problem +
            '), so nothing was changed.'
        );
      }
    }
    return days;
  }

  /** The days written into a version, as they are. */
  private static void writeDays(Id versionId, List<ScheduleDays.DayGrid> days) {
    List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
    for (ScheduleDays.DayGrid day : days) {
      saves.add(new ScheduleDaySaves.DaySave(day.day, day.grid, null));
    }
    ScheduleDaySaves.write(versionId, saves);
  }

  /** A new version of the draft's week (no days yet). */
  private static Id newVersion(Schedule__c draft, String name, String reason) {
    Schedule__c version = new Schedule__c(
      Program__c = draft.Program__c,
      Week__c = draft.Week__c,
      Name = name,
      Status__c = VERSION,
      Origin__c = draft.Origin__c,
      VersionReason__c = reason,
      SourceSchedule__c = draft.Id
    );
    Database.insert(version, AccessLevel.USER_MODE);
    return version.Id;
  }
}
