/**
 * Who leads an activity (ADR 0031 piece B): none, one or more of the season's staff, one
 * ActivityLeader__c row each. Leaders belong to the activity, not to each cell; the generator
 * never reads them. A leader is said by the staff member's record Id, as the panel and the engine
 * say it.
 */
public with sharing class ActivityLeaders {
  /** The leaders of a read activity (its Leaders__r rows, SeasonSetupReader). */
  public static Set<Id> of(Activity__c activity) {
    Set<Id> result = new Set<Id>();
    for (ActivityLeader__c row : activity.Leaders__r) {
      if (row.StaffMember__c != null) {
        result.add(row.StaffMember__c);
      }
    }
    return result;
  }

  /** The leaders now, in the Staff list's order. */
  public static List<Id> now(Id activityId) {
    List<Id> result = new List<Id>();
    for (ActivityLeader__c row : [
      SELECT StaffMember__c
      FROM ActivityLeader__c
      WHERE Activity__c = :activityId AND StaffMember__c != NULL
      WITH USER_MODE
      ORDER BY StaffMember__r.SortOrder__c NULLS LAST, StaffMember__r.Name
    ]) {
      result.add(row.StaffMember__c);
    }
    return result;
  }

  /** Whether two lists name the same people, in any order. */
  public static Boolean same(List<Id> a, List<Id> b) {
    return new Set<Id>(a ?? new List<Id>())
      .equals(new Set<Id>(b ?? new List<Id>()));
  }

  /**
   * The rows for these people (each once). An Id that isn't a staff member is refused in the
   * panel's words; one of another season is refused by its trigger.
   */
  public static List<ActivityLeader__c> rows(Id activityId, List<Id> staffIds) {
    List<ActivityLeader__c> result = new List<ActivityLeader__c>();
    for (Id staffId : new Set<Id>(staffIds ?? new List<Id>())) {
      if (
        staffId == null ||
        staffId.getSObjectType() != StaffMember__c.SObjectType
      ) {
        throw new ShoreshException(
          'Who leads it can only name this ' +
            labels(activityId).singularInSentence('Season') +
            '\'s ' +
            labels(activityId).pluralInSentence('StaffMember') +
            '.'
        );
      }
      result.add(
        new ActivityLeader__c(
          Activity__c = activityId,
          StaffMember__c = staffId
        )
      );
    }
    return result;
  }

  /** The camp's words, read only to say a refusal. */
  private static CampLabels labels(Id activityId) {
    return CampLabels.forCamp(
      [
        SELECT Season__r.Camp__c
        FROM Activity__c
        WHERE Id = :activityId
        WITH USER_MODE
      ]
      .Season__r.Camp__c
    );
  }

  /**
   * Saves who leads it (the panel's Who leads it, and change_activity_details), all of them,
   * only while the leaders are still as the person saw them (seen; ADR 0011 choice 5): someone
   * else's change since is answered (theirLeaders), not overwritten, and nothing is saved.
   * Someone else having chosen the same is no question. The activity is held until the request
   * ends, so no one changes it between compare and save.
   */
  public static RowSaves.Result save(
    Id activityId,
    List<Id> staffIds,
    List<Id> seen
  ) {
    if (activityId == null) {
      throw new ShoreshException('Save the new row in the table first.');
    }
    if (seen == null) {
      throw new ShoreshException(
        'Who leads it' +
        AgentRefusal.say(
          ' wasn\'t saved: reload the page and change it again.',
          ' wasn\'t saved.'
        )
      );
    }
    List<ActivityLeader__c> wanted = rows(activityId, staffIds);
    List<Activity__c> held = [
      SELECT Id
      FROM Activity__c
      WHERE Id = :activityId
      WITH USER_MODE
      FOR UPDATE
    ];
    if (held.isEmpty()) {
      throw new ShoreshException(
        'That was not found, or you do not have access to it.'
      );
    }
    RowSaves.Result result = new RowSaves.Result();
    List<Id> now = now(activityId);
    if (!same(seen, now) && !same(staffIds, now)) {
      result.theirLeaders = now;
      return result;
    }
    replace(activityId, wanted);
    result.id = activityId;
    return result;
  }

  /** Puts these rows in place of the activity's own (all of them, blank staff too). */
  public static void replace(Id activityId, List<ActivityLeader__c> rows) {
    Database.delete(
      [
        SELECT Id
        FROM ActivityLeader__c
        WHERE Activity__c = :activityId
        WITH USER_MODE
      ],
      true,
      AccessLevel.USER_MODE
    );
    Database.insert(rows, AccessLevel.USER_MODE);
  }
}
