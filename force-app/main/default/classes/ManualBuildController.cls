/**
 * Server side of Manual Build (desktop: the Manual schedule screen): open a program's draft for a
 * week, start a blank week, save slot edits (each made only if its slots still hold what the
 * director saw), and add an activity typed into a slot. Every query runs in user mode and every
 * write uses user-mode DML.
 */
public with sharing class ManualBuildController {
  private static final Integer NAME_LIMIT = 80;

  /** The program's Manual Build draft for the week, or null when it has not been started. */
  @AuraEnabled
  public static ManualBuildViews.DraftView getDraft(Id programId, Id weekId) {
    try {
      Schedule__c draft = ManualDrafts.find(programId, weekId);
      return draft == null ? null : ManualBuildViews.open(draft.Id);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** "Start a blank week": fixed and recurring activities placed, everything else Open. */
  @AuraEnabled
  public static ManualBuildViews.DraftView startBlankWeek(
    Id programId,
    Id weekId
  ) {
    try {
      return ManualBuildViews.open(ManualDrafts.start(programId, weekId));
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  @AuraEnabled
  public static SlotSaves.Result saveSlots(
    Id scheduleId,
    List<SlotSaves.SlotEdit> edits
  ) {
    try {
      return SlotSaves.save(
        scheduleId,
        edits == null ? new List<SlotSaves.SlotEdit>() : edits
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * "Add <name> as an activity" from a slot: a new activity with the starting values an activity
   * added by hand gets (Activities screen). A name the season already has (ignoring spaces and
   * capitals) gives that activity instead.
   */
  @AuraEnabled
  public static ManualBuildViews.ActivityOption addActivity(
    Id scheduleId,
    String name
  ) {
    String trimmed = name == null ? '' : name.normalizeSpace();
    if (trimmed.length() == 0) {
      throw ScreenErrors.of('Type a name first.');
    }
    if (trimmed.length() > NAME_LIMIT) {
      throw ScreenErrors.of(
        'Keep the name to ' + NAME_LIMIT + ' characters or fewer.'
      );
    }
    try {
      Schedule__c schedule = [
        SELECT Program__c, Program__r.Season__c
        FROM Schedule__c
        WHERE Id = :scheduleId
        WITH USER_MODE
      ];
      Id seasonId = schedule.Program__r.Season__c;
      Id activityId = sameName(seasonId, trimmed);
      if (activityId == null) {
        Activity__c activity = new Activity__c(
          Season__c = seasonId,
          Name = trimmed,
          Length__c = 1,
          TimesPerWeekMin__c = 1,
          TimesPerWeekMax__c = 1,
          Priority__c = 'Low',
          Outdoor__c = false,
          GroupsAtOnce__c = 1,
          NoWeeklyMax__c = false,
          NoGroupLimit__c = false
        );
        UserModeWrites.save(new List<SObject>{ activity });
        activityId = activity.Id;
      }
      for (
        ManualBuildViews.ActivityOption option : ManualBuildViews.options(
          seasonId,
          BlankWeek.groupsOf(schedule.Program__c)
        )
      ) {
        if (option.id == activityId) {
          return option;
        }
      }
      throw new ShoreshException('Couldn\'t add it. Try again.');
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  private static Id sameName(Id seasonId, String name) {
    String key = looseName(name);
    for (Activity__c activity : [
      SELECT Id, Name
      FROM Activity__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ]) {
      if (looseName(activity.Name) == key) {
        return activity.Id;
      }
    }
    return null;
  }

  private static String looseName(String name) {
    return name == null ? '' : name.deleteWhitespace().toLowerCase();
  }
}
