/**
 * Why a record cannot be deleted from the setup screens because something else still uses it,
 * in the camp's own words; null when nothing is in the way. Salesforce's restrict-delete lookups
 * are the backstop; these messages say what uses the record and where to change it. A record's
 * own unticked weeks never stand in the way: they go with it (WeekExceptions.deleteWithWeeks).
 */
public with sharing class InUse {
  private static final Integer MAX_NAMES = 20;

  public static String reason(Id recordId) {
    // Fixed and recurring activities too (locations are covered below), in one refusal.
    return SetTimeInUse.alongside(activityUseReason(recordId), recordId);
  }

  private static String activityUseReason(Id recordId) {
    Schema.SObjectType kind = recordId.getSObjectType();
    if (
      kind == Group__c.SObjectType ||
      kind == Division__c.SObjectType ||
      kind == Program__c.SObjectType
    ) {
      return eligibilityReason(recordId, kind);
    }
    if (kind == Location__c.SObjectType) {
      return locationReason(recordId);
    }
    if (kind == Activity__c.SObjectType) {
      return activityReason(recordId);
    }
    return null;
  }

  /** A group, division, or program (or a group inside it) named in "who can do it". */
  private static String eligibilityReason(
    Id recordId,
    Schema.SObjectType kind
  ) {
    List<ActivityEligibility__c> rows = [
      SELECT Activity__r.Name, Activity__r.Season__r.Camp__c
      FROM ActivityEligibility__c
      WHERE
        Group__c = :recordId
        OR Division__c = :recordId
        OR Group__r.Division__c = :recordId
        OR Division__r.Program__c = :recordId
        OR Group__r.Division__r.Program__c = :recordId
      WITH USER_MODE
      ORDER BY Activity__r.Name, Id
      LIMIT 21
    ];
    if (rows.isEmpty()) {
      return null;
    }
    CampLabels labels = CampLabels.forCamp(
      rows[0].Activity__r.Season__r.Camp__c
    );
    List<String> names = new List<String>();
    for (ActivityEligibility__c row : rows) {
      names.add(row.Activity__r.Name);
    }
    String what = kind == Program__c.SObjectType
      ? 'some of its ' +
        labels.pluralInSentence('Division') +
        ' or ' +
        labels.pluralInSentence('Group') +
        ' are'
      : kind == Division__c.SObjectType
          ? 'it (or one of its ' + labels.pluralInSentence('Group') + ') is'
          : 'it is';
    return 'This can\'t be deleted yet: ' +
      what +
      ' in "Who can do it" for ' +
      quoted(names) +
      '. Change who can do ' +
      (rows.size() == 1
        ? 'that ' + labels.singularInSentence('Activity')
        : 'those ' + labels.pluralInSentence('Activity')) +
      ' first, then delete it.';
  }

  private static String locationReason(Id locationId) {
    List<Location__c> found = [
      SELECT Season__r.Camp__c
      FROM Location__c
      WHERE Id = :locationId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      return null;
    }
    CampLabels labels = CampLabels.forCamp(found[0].Season__r.Camp__c);
    List<String> parts = new List<String>();
    List<String> fixes = new List<String>();
    List<String> activities = new List<String>();
    for (Activity__c activity : [
      SELECT Name
      FROM Activity__c
      WHERE Location__c = :locationId
      WITH USER_MODE
      ORDER BY Name
      LIMIT 21
    ]) {
      activities.add(activity.Name);
    }
    if (!activities.isEmpty()) {
      parts.add(
        quoted(activities) +
          (activities.size() == 1 ? ' happens' : ' happen') +
          ' here'
      );
      fixes.add(
        'choose another ' +
          labels.singularInSentence('Location') +
          ' for ' +
          thatOrThose(labels, 'Activity', activities.size())
      );
    }
    List<String> setTime = SetTimeInUse.atLocation(locationId, labels);
    if (!setTime.isEmpty()) {
      parts.add(setTime[0]);
      fixes.add(setTime[1]);
    }
    List<String> events = specialEventsAt(locationId, labels);
    if (!events.isEmpty()) {
      parts.add(events[0]);
      fixes.add(events[1]);
    }
    return parts.isEmpty() ? null : refusal(parts, fixes);
  }

  /** '"Carnival" happens here' and its fix, or an empty list when no special event is there. */
  private static List<String> specialEventsAt(
    Id locationId,
    CampLabels labels
  ) {
    List<String> names = new List<String>();
    for (SpecialEvent__c event : [
      SELECT Name
      FROM SpecialEvent__c
      WHERE Location__c = :locationId
      WITH USER_MODE
      ORDER BY Name
      LIMIT 21
    ]) {
      names.add(event.Name);
    }
    if (names.isEmpty()) {
      return names;
    }
    return new List<String>{
      quoted(names) +
      (names.size() == 1 ? ' happens' : ' happen') +
      ' here',
      'choose another ' +
      labels.singularInSentence('Location') +
      ' for ' +
      thatOrThose(labels, 'SpecialEvent', names.size())
    };
  }

  /** "that activity" or "those activities", in the camp's words. */
  private static String thatOrThose(
    CampLabels labels,
    String term,
    Integer count
  ) {
    return count == 1
      ? 'that ' + labels.singularInSentence(term)
      : 'those ' + labels.pluralInSentence(term);
  }

  private static String refusal(List<String> parts, List<String> fixes) {
    return 'This can\'t be deleted yet: ' +
      String.join(parts, ', and ') +
      '. First ' +
      String.join(fixes, ' and ') +
      ', then delete it.';
  }

  private static String activityReason(Id activityId) {
    List<Activity__c> found = [
      SELECT Season__r.Camp__c
      FROM Activity__c
      WHERE Id = :activityId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      return null;
    }
    CampLabels labels = CampLabels.forCamp(found[0].Season__r.Camp__c);
    List<String> parts = new List<String>();
    List<String> fixes = new List<String>();
    List<Activity__c> backups = [
      SELECT Name
      FROM Activity__c
      WHERE RainPlan__c = :activityId
      WITH USER_MODE
      ORDER BY Name
      LIMIT 21
    ];
    if (!backups.isEmpty()) {
      List<String> names = new List<String>();
      for (Activity__c activity : backups) {
        names.add(activity.Name);
      }
      parts.add(
        'it is the ' +
          labels.singularInSentence('RainPlan') +
          ' for ' +
          quoted(names)
      );
      fixes.add(
        'choose another ' + labels.singularInSentence('RainPlan') + ' there'
      );
    }
    if (parts.isEmpty()) {
      return null;
    }
    return 'This can\'t be deleted yet: ' +
      String.join(parts, ', and ') +
      '. First ' +
      String.join(fixes, ' and ') +
      ', then delete it.';
  }

  /** "Archery", "Swim" … up to 20 names, then "and more". */
  public static String quoted(List<String> names) {
    List<String> shown = new List<String>();
    for (Integer i = 0; i < Math.min(names.size(), MAX_NAMES); i++) {
      shown.add('"' + names[i] + '"');
    }
    if (names.size() > MAX_NAMES) {
      shown.add('and more');
    }
    return String.join(shown, ', ');
  }
}
