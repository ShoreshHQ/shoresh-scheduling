/**
 * Saves an activity's "more rules" and who can do it, all or none. Who can do it is a list of
 * divisions and groups; an empty list means every group (decision: none means everyone). The
 * saved list replaces the old one.
 */
public with sharing class ActivityDetails {
  // The only activity fields this save may change.
  private static final Set<String> RULE_FIELDS = new Set<String>{
    'SameDivisionOnly__c',
    'EarlyWeekCount__c',
    'EarlyWeekByDay__c',
    'EventOnly__c',
    'Notes__c'
  };

  public static void save(Activity__c rules, List<Id> whoCanDoIt) {
    if (rules == null || rules.Id == null) {
      throw new ShoreshException('Save the new row in the table first.');
    }
    CampLabels labels = labelsFor(rules.Id);
    Activity__c changes = ruleChanges(rules);
    List<ActivityEligibility__c> adds = eligibilityRows(
      rules.Id,
      whoCanDoIt,
      labels
    );
    List<ActivityEligibility__c> removes = [
      SELECT Id
      FROM ActivityEligibility__c
      WHERE Activity__c = :rules.Id
      WITH USER_MODE
    ];
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Database.update(changes, AccessLevel.USER_MODE);
      Database.delete(removes, true, AccessLevel.USER_MODE);
      Database.insert(adds, AccessLevel.USER_MODE);
    } catch (DmlException e) {
      Database.rollback(beforeSave);
      throw e;
    }
  }

  /**
   * Why these screen saves would make an activity its own rain plan, or null. Salesforce refuses
   * that with a "hierarchy" message before any Shoresh check runs, so the screens ask first.
   */
  public static String ownRainPlanProblem(List<SObject> records) {
    for (SObject record : records) {
      if (
        record instanceof Activity__c &&
        record.Id != null &&
        record.get('RainPlan__c') == record.Id
      ) {
        return 'Choose a different one as the indoor backup: it cannot be its own.';
      }
    }
    return null;
  }

  private static CampLabels labelsFor(Id activityId) {
    List<Activity__c> found = [
      SELECT Season__r.Camp__c
      FROM Activity__c
      WHERE Id = :activityId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      throw new ShoreshException(
        'That was not found, or you do not have access to it.'
      );
    }
    return CampLabels.forCamp(found[0].Season__r.Camp__c);
  }

  private static Activity__c ruleChanges(Activity__c rules) {
    Activity__c changes = new Activity__c(Id = rules.Id);
    Map<String, Object> given = rules.getPopulatedFieldsAsMap();
    for (String field : RULE_FIELDS) {
      if (given.containsKey(field)) {
        changes.put(field, given.get(field));
      }
    }
    return changes;
  }

  /** One row per division or group named (each once). */
  private static List<ActivityEligibility__c> eligibilityRows(
    Id activityId,
    List<Id> whoCanDoIt,
    CampLabels labels
  ) {
    List<ActivityEligibility__c> rows = new List<ActivityEligibility__c>();
    Set<Id> seen = new Set<Id>();
    for (Id target : whoCanDoIt == null ? new List<Id>() : whoCanDoIt) {
      if (target == null || !seen.add(target)) {
        continue;
      }
      Schema.SObjectType kind = target.getSObjectType();
      if (kind != Division__c.SObjectType && kind != Group__c.SObjectType) {
        throw new ShoreshException(
          'Who can do it can only name ' +
            labels.pluralInSentence('Division') +
            ' and ' +
            labels.pluralInSentence('Group') +
            '.'
        );
      }
      ActivityEligibility__c row = new ActivityEligibility__c(
        Activity__c = activityId
      );
      row.put(
        kind == Division__c.SObjectType ? 'Division__c' : 'Group__c',
        target
      );
      rows.add(row);
    }
    return rows;
  }
}
