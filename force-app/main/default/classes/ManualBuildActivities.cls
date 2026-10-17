/**
 * "Add <name>" from a Manual Build slot (Greg, 2026-10-17): a new activity with the starting values
 * an activity added by hand gets on the Activities screen. A name the season already has (spaces
 * and capitals aside) gives that activity instead. Runs in user mode.
 */
public with sharing class ManualBuildActivities {
  private static final Integer NAME_LIMIT = 80;

  /** The activity, as Manual Build offers it for the schedule's groups. */
  public static ManualBuildViews.ActivityOption add(
    Id scheduleId,
    String name
  ) {
    String trimmed = checkedName(name);
    Schedule__c schedule = [
      SELECT Program__c, Program__r.Season__c
      FROM Schedule__c
      WHERE Id = :scheduleId
      WITH USER_MODE
    ];
    Id seasonId = schedule.Program__r.Season__c;
    Id activityId = sameName(seasonId, trimmed);
    if (activityId == null) {
      activityId = create(seasonId, trimmed);
    }
    for (
      ManualBuildViews.ActivityOption option : ManualBuildViews.options(
        seasonId,
        ProgramReads.groupsOf(schedule.Program__c)
      )
    ) {
      if (option.id == activityId) {
        return option;
      }
    }
    throw new ShoreshException('Couldn\'t add it. Try again.');
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

  private static Id create(Id seasonId, String name) {
    Activity__c activity = new Activity__c(
      Season__c = seasonId,
      Name = name,
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
    return activity.Id;
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
