/**
 * "Add <name>" from a Manual Build slot (Greg, 2026-10-17), and from a Generated Schedule slot, as
 * the desktop's generated schedule allows: a new activity at 0 times a week, as one typed into a
 * special day's schedule starts (LOCK-4.12, SpecialActivities), so no bunk is short of it and a
 * build never spreads it. A name the season already has (spaces and capitals aside) gives that
 * activity instead. Undo of the step takes it off again while nothing else uses it (LOCK-5.5,
 * removeUnused). Runs in user mode.
 */
public with sharing class ManualBuildActivities {
  private static final Integer NAME_LIMIT = 80;

  /** The activity, as Manual Build offers it for the schedule's groups. From Manual Build's draft. */
  public static ManualBuildViews.ActivityOption add(
    Id scheduleId,
    String name
  ) {
    String trimmed = checkedName(name);
    // The season first, then the draft, the order imports lock in: two people adding the same
    // new name at once (from any week or program of the season) get one activity, the second
    // finding the first one's.
    Id seasonId = lockedSeasonOf(scheduleId);
    return addIn(seasonId, ManualDrafts.locked(scheduleId), trimmed);
  }

  /**
   * The same from Generated Schedule's draft (GeneratedDrafts.lockedToEdit): a version, a
   * published schedule or Manual Build's draft is refused there, as for its hand edits.
   */
  public static ManualBuildViews.ActivityOption addOnGenerated(
    Id scheduleId,
    String name
  ) {
    String trimmed = checkedName(name);
    Id seasonId = lockedSeasonOf(scheduleId);
    return addIn(seasonId, GeneratedDrafts.lockedToEdit(scheduleId), trimmed);
  }

  /** The activity named, made if the season has none by that name, for the schedule's groups. */
  private static ManualBuildViews.ActivityOption addIn(
    Id seasonId,
    Schedule__c schedule,
    String trimmed
  ) {
    SpecialActivities.Named found = SpecialActivities.named(
      seasonId,
      new List<String>{ trimmed }
    );
    Id activityId = found.byName.get(SpecialActivities.looseName(trimmed)).Id;
    for (
      ManualBuildViews.ActivityOption option : ManualBuildViews.options(
        seasonId,
        ProgramReads.groupsOf(schedule.Program__c)
      )
    ) {
      if (option.id == activityId) {
        for (Activity__c record : SeasonSetupReader.activitiesOf(seasonId)) {
          if (record.Id == activityId) {
            option.record = record;
          }
        }
        option.created = !found.added.isEmpty();
        return option;
      }
    }
    throw new ShoreshException('Shoresh couldn\'t tell why. Try again.');
  }

  /**
   * LOCK-5.5: Undo of "Add <name>" on Manual Build's draft takes the activity it made off again
   * (removeUnused). True when it was.
   */
  public static Boolean removeFromManualBuild(Id scheduleId, Id activityId) {
    Id seasonId = lockedSeasonOf(scheduleId);
    ManualDrafts.locked(scheduleId);
    return removeUnused(seasonId, activityId);
  }

  /** The same from Generated Schedule's draft: a version or a published schedule is refused. */
  public static Boolean removeFromGenerated(Id scheduleId, Id activityId) {
    Id seasonId = lockedSeasonOf(scheduleId);
    GeneratedDrafts.lockedToEdit(scheduleId);
    return removeUnused(seasonId, activityId);
  }

  /**
   * The activity taken off the season, only while nothing else uses it: made by this person and
   * unchanged on Activities since, no who-can-do-it row, rain plan, offering, week off or copy
   * pointing at it, and no schedule day, special day's or event's plan, or published plan saved
   * since it was made naming it (another cell, a version kept, a publish). The undo's own save
   * comes first, so the week shown no longer holds it. False when it stays (it is in use).
   */
  private static Boolean removeUnused(Id seasonId, Id activityId) {
    List<Activity__c> found = [
      SELECT Id, CreatedDate, CreatedById, LastModifiedDate
      FROM Activity__c
      WHERE Id = :activityId AND Season__c = :seasonId
      WITH USER_MODE
    ];
    if (
      found.isEmpty() ||
      found[0].CreatedById != UserInfo.getUserId() ||
      found[0].LastModifiedDate != found[0].CreatedDate ||
      pointedAt(activityId) ||
      named(seasonId, activityId, found[0].CreatedDate)
    ) {
      return false;
    }
    // Not remembered as deleted (SetupDeletions): the director never deleted it, only undid it.
    Database.delete(found, true, AccessLevel.USER_MODE);
    return true;
  }

  // The in-use checks read in system mode: a cell, plan or row the person can't see still uses the
  // activity, and nothing read here is shown or returned (only whether to keep it).
  private static Boolean pointedAt(Id activityId) {
    return [
        SELECT COUNT()
        FROM Activity__c
        WHERE RainPlan__c = :activityId OR CopiedFrom__c = :activityId
        WITH SYSTEM_MODE
      ] +
      [
        SELECT COUNT()
        FROM ActivityEligibility__c
        WHERE Activity__c = :activityId
        WITH SYSTEM_MODE
      ] +
      [
        SELECT COUNT()
        FROM Offering__c
        WHERE Activity__c = :activityId
        WITH SYSTEM_MODE
      ] +
      [
        SELECT COUNT()
        FROM WeekException__c
        WHERE Activity__c = :activityId
        WITH SYSTEM_MODE
      ] > 0;
  }

  /** Whether a grid saved since the activity was made names it (by its Id's first 15 letters). */
  private static Boolean named(Id seasonId, Id activityId, Datetime since) {
    String key = String.valueOf(activityId).left(15);
    return holds(
        [
          SELECT Grid__c
          FROM ScheduleDay__c
          WHERE
            Schedule__r.Program__r.Season__c = :seasonId
            AND SystemModstamp >= :since
          WITH SYSTEM_MODE
        ],
        ScheduleDay__c.Grid__c,
        key
      ) ||
      holds(
        [
          SELECT Plan__c
          FROM PlanPart__c
          WHERE Season__c = :seasonId AND SystemModstamp >= :since
          WITH SYSTEM_MODE
        ],
        PlanPart__c.Plan__c,
        key
      ) ||
      holds(
        [
          SELECT Plan__c
          FROM PublishedPlan__c
          WHERE
            Schedule__r.Program__r.Season__c = :seasonId
            AND SystemModstamp >= :since
          WITH SYSTEM_MODE
        ],
        PublishedPlan__c.Plan__c,
        key
      );
  }

  private static Boolean holds(
    List<SObject> rows,
    Schema.SObjectField text,
    String key
  ) {
    for (SObject row : rows) {
      String value = (String) row.get(text);
      if (value != null && value.contains(key)) {
        return true;
      }
    }
    return false;
  }

  private static Id lockedSeasonOf(Id scheduleId) {
    List<Schedule__c> found = [
      SELECT Program__r.Season__c, Program__r.Season__r.Camp__c
      FROM Schedule__c
      WHERE Id = :scheduleId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      throw new ShoreshException(ScreenErrorWords.SCHEDULE_NOT_FOUND);
    }
    if (
      [
          SELECT Id
          FROM Season__c
          WHERE Id = :found[0].Program__r.Season__c
          WITH USER_MODE
          FOR UPDATE
        ]
        .isEmpty()
    ) {
      CampLabels labels = CampLabels.forCamp(
        found[0].Program__r.Season__r.Camp__c
      );
      throw new ShoreshException(
        'You don\'t have access to change this ' +
          labels.singularInSentence('Season') +
          '.'
      );
    }
    return found[0].Program__r.Season__c;
  }

  private static String checkedName(String name) {
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
}
