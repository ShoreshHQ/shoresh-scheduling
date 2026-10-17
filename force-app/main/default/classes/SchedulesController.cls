/**
 * Server side of the schedule page: a program's versions for a week, opening one to view in the
 * daily, group, and activity views, and renaming it. Cells cannot be changed here (slice 4a).
 * Every query runs in user mode and every write uses user-mode DML.
 */
public with sharing class SchedulesController {
  private static final Integer NAME_LIMIT = 80;

  @AuraEnabled
  public static List<ScheduleViews.VersionRow> getVersions(
    Id programId,
    Id weekId
  ) {
    try {
      return ScheduleViews.versions(programId, weekId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  @AuraEnabled
  public static ScheduleViews.ScheduleView openSchedule(Id scheduleId) {
    ScheduleViews.ScheduleView view;
    try {
      view = ScheduleViews.open(scheduleId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
    if (view == null) {
      throw ScreenErrors.of(
        'That schedule was not found, or you do not have access to it.'
      );
    }
    return view;
  }

  /** Gives a schedule (a version) a new name. */
  @AuraEnabled
  public static void renameSchedule(Id scheduleId, String name) {
    List<Schedule__c> found = [
      SELECT Id, Program__r.Season__r.Camp__c
      FROM Schedule__c
      WHERE Id = :scheduleId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      throw ScreenErrors.of(
        'That schedule was not found, or you do not have access to it.'
      );
    }
    String trimmed = checkedName(name, found[0].Program__r.Season__r.Camp__c);
    try {
      UserModeWrites.save(
        new List<SObject>{ new Schedule__c(Id = scheduleId, Name = trimmed) }
      );
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** The name without spaces around it; refused if blank or too long. */
  private static String checkedName(String name, Id campId) {
    String trimmed = name == null ? '' : name.trim();
    if (trimmed.length() == 0) {
      throw ScreenErrors.of(
        'Give the ' +
          CampLabels.forCamp(campId).singularInSentence('Version') +
          ' a name.'
      );
    }
    if (trimmed.length() > NAME_LIMIT) {
      throw ScreenErrors.of(
        'Keep the name to ' + NAME_LIMIT + ' characters or fewer.'
      );
    }
    return trimmed;
  }
}
