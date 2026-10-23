/**
 * Versions on Manual Build (desktop useSnapshots.js, VersionsDropdown.jsx; ADR 0008 §25): Save
 * version keeps the draft as it is now under a name; Restore copies a version of the same week
 * (from Manual Build or Generated Schedule, Greg's decision 9) into the draft, after keeping the
 * draft as it was as an automatic version ("Before Restore"), the desktop's way back; Delete
 * takes a version away. The draft is locked while any of these runs. Runs in user mode.
 * Generated Schedule's Versions use the same path (ADR 0010 "Choices (Versions)"): its screen
 * hands in its own locked draft (GeneratedDrafts.lockedToEdit), and a version keeps the option
 * the week was built with, so Restore brings it back.
 */
public with sharing class ManualVersions {
  public static final String VERSION = 'Version';
  public static final String SAVED_BY_HAND = 'SavedByHand';
  public static final String AUTO_SAVED = 'AutoSaved';
  public static final String BEFORE_RESTORE = 'Before Restore';

  /** Save version: the draft as it is now, kept under a name. Returns the version's Id. */
  public static Id save(Id draftId, String name) {
    return saveOf(ManualDrafts.locked(draftId), name);
  }

  /** The same, for a draft its screen has locked (Generated: GeneratedDrafts.lockedToEdit). */
  public static Id saveOf(Schedule__c draft, String name) {
    Id draftId = draft.Id;
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
    return restoreInto(ManualDrafts.locked(draftId), versionId, seenRevisions);
  }

  /**
   * The same, into a draft its screen has locked (Generated: GeneratedDrafts.lockedToEdit). The
   * version's days come as they are, locks included (ADR 0010 §32, §43); a Generated draft also
   * takes the version's option when it has one. A version Generated Schedule didn't build (Manual
   * Build's or an imported one) restored into a Generated draft comes in with its placed cells
   * locked: each was a hand choice, and a hand choice is a lock (Greg, 2026-10-19; ADR 0010 §50).
   */
  public static Id restoreInto(
    Schedule__c draft,
    Id versionId,
    String seenRevisions
  ) {
    Id draftId = draft.Id;
    Schedule__c version = versionOf(versionId, draft);
    List<ScheduleDays.DayGrid> current = ScheduleDays.read(draftId);
    if (ScheduleDays.stamp(current) != seenRevisions) {
      throw new ChangedSinceException();
    }
    List<ScheduleDays.DayGrid> restored = readable(
      ScheduleDays.read(version.Id)
    );
    lockHandChoices(draft, version, restored);
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
        ScheduleDaySaves.DaySave save = new ScheduleDaySaves.DaySave(
          day.day,
          day.grid,
          revisions.get(day.day)
        );
        // The version's cells come back without the week's "Rain plan full" marks: restoring
        // "Before rainy Monday" is the way back from a rainy day (repo docs/adr/0019).
        save.rain = new List<String>();
        saves.add(save);
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
      takeOption(draft, version);
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
    removeFrom(ManualDrafts.locked(draftId), versionId);
  }

  /** The same, from a draft its screen has locked (Generated: GeneratedDrafts.lockedToEdit). */
  public static void removeFrom(Schedule__c draft, Id versionId) {
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
      SELECT
        Id,
        Name,
        Status__c,
        Program__c,
        Week__c,
        PublishedAt__c,
        EngineOption__c,
        Origin__c
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

  /**
   * An automatic version of the draft's days as they are (Update to match setup keeps one before
   * it takes away a director's placement). Refused if a day can't be read.
   */
  public static Id keepAutomatically(
    Schedule__c draft,
    String name,
    List<ScheduleDays.DayGrid> days
  ) {
    Id kept = newVersion(draft, name, AUTO_SAVED);
    writeDays(kept, readable(days));
    return kept;
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
    // A Generated week's version keeps the option it was built with, as Rebuild's does (§16).
    if (isGenerated(draft)) {
      version.EngineOption__c = draft.EngineOption__c;
    }
    Database.insert(version, AccessLevel.USER_MODE);
    return version.Id;
  }

  /**
   * A version not built by Generated Schedule (Manual Build's, an imported one, or one from before
   * Origin) restored on Generated Schedule: its placed cells come in locked, since none was
   * generated and a hand choice is a lock (Greg, 2026-10-19; ADR 0010 §32, §50).
   */
  private static void lockHandChoices(
    Schedule__c draft,
    Schedule__c version,
    List<ScheduleDays.DayGrid> days
  ) {
    if (isGenerated(draft) && version.Origin__c != GeneratedDrafts.GENERATED) {
      GeneratedLockCells.lockPlaced(days);
    }
  }

  /** A Generated week goes on from the version's option, when it has one (ADR 0010 §17). */
  private static void takeOption(Schedule__c draft, Schedule__c version) {
    if (
      isGenerated(draft) &&
      version.EngineOption__c != null &&
      version.EngineOption__c != draft.EngineOption__c
    ) {
      Database.update(
        new Schedule__c(
          Id = draft.Id,
          EngineOption__c = version.EngineOption__c
        ),
        AccessLevel.USER_MODE
      );
    }
  }

  /** A Generated Schedule draft (its lock read EngineOption__c; Manual Build's doesn't). */
  private static Boolean isGenerated(Schedule__c draft) {
    return draft.Origin__c == GeneratedDrafts.GENERATED;
  }
}
