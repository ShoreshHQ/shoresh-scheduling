/**
 * Why a week, program, division, group, time block or activity cannot be deleted from the setup
 * screens because electives use it, naming what uses it; null when nothing is in the way. The
 * restrict-delete lookups on the elective objects are the backstop (repo ADR 0018). A week with
 * elective runs is refused as on the desktop (DeleteWeekDialog: "Delete its elective runs first").
 */
public with sharing class ElectivesInUse {
  private static final Integer MAX_ROWS = 21;

  /** Another refusal (or null) with this one added, so one refusal names everything. */
  public static String alongside(String otherReason, Id recordId) {
    String electives = reason(recordId);
    if (otherReason == null || electives == null) {
      return otherReason != null ? otherReason : electives;
    }
    return otherReason +
      ' Also, ' +
      electives.removeStart('This can\'t be deleted yet: ');
  }

  public static String reason(Id recordId) {
    Schema.SObjectType kind = recordId.getSObjectType();
    List<String> parts = new List<String>();
    List<String> fixes = new List<String>();
    Id campId;
    if (kind == Activity__c.SObjectType) {
      List<String> sets = new List<String>();
      for (Offering__c offering : [
        SELECT ElectiveSet__r.Name, ElectiveSet__r.Season__r.Camp__c
        FROM Offering__c
        WHERE Activity__c = :recordId
        WITH USER_MODE
        ORDER BY ElectiveSet__r.Name, Id
        LIMIT :MAX_ROWS
      ]) {
        sets.add(offering.ElectiveSet__r.Name);
        campId = offering.ElectiveSet__r.Season__r.Camp__c;
      }
      if (!sets.isEmpty()) {
        CampLabels labels = CampLabels.forCamp(campId);
        parts.add('it is offered in ' + InUse.quoted(sets));
        fixes.add(
          'take it off ' +
          (sets.size() == 1
            ? 'that ' + labels.singularInSentence('ElectiveSet')
            : 'those ' + labels.pluralInSentence('ElectiveSet'))
        );
      }
    }
    if (kind == Division__c.SObjectType || kind == Program__c.SObjectType) {
      List<String> choices = new List<String>();
      for (Coverage__c row : [
        SELECT LinkedChoice__r.Name, Season__r.Camp__c
        FROM Coverage__c
        WHERE
          LinkedChoice__c != NULL
          AND (Division__c = :recordId
          OR Division__r.Program__c = :recordId)
        WITH USER_MODE
        ORDER BY LinkedChoice__r.Name, Id
        LIMIT :MAX_ROWS
      ]) {
        choices.add(row.LinkedChoice__r.Name);
        campId = row.Season__r.Camp__c;
      }
      if (!choices.isEmpty()) {
        CampLabels labels = CampLabels.forCamp(campId);
        parts.add(
          (kind == Program__c.SObjectType
              ? 'some of its ' + labels.pluralInSentence('Division') + ' are'
              : 'it is') +
            ' named by ' +
            InUse.quoted(choices)
        );
        fixes.add(
          'change who ' +
            (choices.size() == 1
              ? 'that ' + labels.singularInSentence('LinkedChoice') + ' is'
              : 'those ' + labels.pluralInSentence('LinkedChoice') + ' are') +
            ' for'
        );
      }
    }
    if (kind == TimeBlock__c.SObjectType) {
      List<String> choices = new List<String>();
      for (LinkedChoiceTime__c row : [
        SELECT
          LinkedChoice__r.Name,
          LinkedChoice__r.ElectiveSet__r.Season__r.Camp__c
        FROM LinkedChoiceTime__c
        WHERE TimeBlock__c = :recordId
        WITH USER_MODE
        ORDER BY LinkedChoice__r.Name, Id
        LIMIT :MAX_ROWS
      ]) {
        choices.add(row.LinkedChoice__r.Name);
        campId = row.LinkedChoice__r.ElectiveSet__r.Season__r.Camp__c;
      }
      if (!choices.isEmpty()) {
        CampLabels labels = CampLabels.forCamp(campId);
        parts.add('it is a period of ' + InUse.quoted(choices));
        fixes.add(
          'take it out of ' +
          (choices.size() == 1
            ? 'that ' + labels.singularInSentence('LinkedChoice')
            : 'those ' + labels.pluralInSentence('LinkedChoice'))
        );
      }
    }
    List<String> runs = runsUsing(recordId, kind);
    if (!runs.isEmpty()) {
      parts.add('it has elective runs: ' + InUse.quoted(runs));
      fixes.add('delete ' + (runs.size() == 1 ? 'that run' : 'those runs'));
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

  /** The names of the elective runs that use the record, or would lose something with it. */
  private static List<String> runsUsing(Id recordId, Schema.SObjectType kind) {
    List<ElectiveRun__c> runs = new List<ElectiveRun__c>();
    if (kind == Week__c.SObjectType) {
      runs = [
        SELECT Name
        FROM ElectiveRun__c
        WHERE Week__c = :recordId
        WITH USER_MODE
        ORDER BY Name, Id
        LIMIT :MAX_ROWS
      ];
    } else if (kind == Program__c.SObjectType) {
      runs = [
        SELECT Name
        FROM ElectiveRun__c
        WHERE
          Schedule__r.Program__c = :recordId
          OR FinalSchedule__r.Program__c = :recordId
        WITH USER_MODE
        ORDER BY Name, Id
        LIMIT :MAX_ROWS
      ];
    } else if (
      kind == Division__c.SObjectType ||
      kind == Group__c.SObjectType
    ) {
      // Choices and seats name the camper's group that week.
      runs = [
        SELECT Name
        FROM ElectiveRun__c
        WHERE
          Id IN (
            SELECT ElectiveRun__c
            FROM Preference__c
            WHERE Group__c = :recordId OR Group__r.Division__c = :recordId
          )
        WITH USER_MODE
        ORDER BY Name, Id
        LIMIT :MAX_ROWS
      ];
      runs.addAll(
        [
          SELECT Name
          FROM ElectiveRun__c
          WHERE
            Id IN (
              SELECT ElectiveRun__c
              FROM Assignment__c
              WHERE Group__c = :recordId OR Group__r.Division__c = :recordId
            )
          WITH USER_MODE
          ORDER BY Name, Id
          LIMIT :MAX_ROWS
        ]
      );
    } else if (kind == TimeBlock__c.SObjectType) {
      runs = [
        SELECT Name
        FROM ElectiveRun__c
        WHERE
          Id IN (
            SELECT ElectiveRun__c
            FROM Assignment__c
            WHERE TimeBlock__c = :recordId
          )
        WITH USER_MODE
        ORDER BY Name, Id
        LIMIT :MAX_ROWS
      ];
    }
    Map<Id, String> names = new Map<Id, String>();
    for (ElectiveRun__c run : runs) {
      names.put(run.Id, run.Name);
    }
    List<String> result = names.values();
    result.sort();
    return result;
  }
}
