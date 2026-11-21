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
    Id activityId = SpecialActivities.named(
        seasonId,
        new List<String>{ trimmed }
      )
      .byName.get(SpecialActivities.looseName(trimmed))
      .Id;
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
        return option;
      }
    }
    throw new ShoreshException('Shoresh couldn\'t tell why. Try again.');
  }

  /**
   * LOCK-5.5: Undo of the step that added an activity from a cell takes the activity off the
   * season again, only while nothing else uses it: unchanged on Activities since it was made, no
   * who-can-do-it row, rain plan, offering or week off pointing at it, and no schedule day,
   * special day's or event's plan, or published plan saved since it was made naming it (another
   * cell, a version kept, a publish). The undo's own save comes first, so the week shown no longer
   * holds it. True when it was taken off; false when it stays (nothing to say: it is in use).
   */
  public static Boolean removeUnused(Id scheduleId, Id activityId) {
    Id seasonId = lockedSeasonOf(scheduleId);
    List<Activity__c> found = [
      SELECT Id, CreatedDate, LastModifiedDate
      FROM Activity__c
      WHERE Id = :activityId AND Season__c = :seasonId
      WITH USER_MODE
    ];
    if (
      found.isEmpty() ||
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
        WHERE RainPlan__c = :activityId
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
    for (ScheduleDay__c day : [
      SELECT Grid__c
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Program__r.Season__c = :seasonId
        AND SystemModstamp >= :since
      WITH SYSTEM_MODE
    ]) {
      if (day.Grid__c != null && day.Grid__c.contains(key)) {
        return true;
      }
    }
    for (PlanPart__c part : [
      SELECT Plan__c
      FROM PlanPart__c
      WHERE Season__c = :seasonId AND SystemModstamp >= :since
      WITH SYSTEM_MODE
    ]) {
      if (part.Plan__c != null && part.Plan__c.contains(key)) {
        return true;
      }
    }
    for (PublishedPlan__c part : [
      SELECT Plan__c
      FROM PublishedPlan__c
      WHERE
        Schedule__r.Program__r.Season__c = :seasonId
        AND SystemModstamp >= :since
      WITH SYSTEM_MODE
    ]) {
      if (part.Plan__c != null && part.Plan__c.contains(key)) {
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
