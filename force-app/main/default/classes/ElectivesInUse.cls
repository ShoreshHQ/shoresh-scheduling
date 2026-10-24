/**
 * Why a week, program, division, group, time block, activity, elective set, offering or linked
 * choice cannot be deleted from the setup screens because electives use it, naming what uses it;
 * null when nothing is in the way. The
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
    Reasons found = new Reasons();
    if (kind == Activity__c.SObjectType) {
      addOfferings(recordId, found);
    }
    if (kind == Division__c.SObjectType || kind == Program__c.SObjectType) {
      addLinkedChoiceDivisions(recordId, kind, found);
    }
    if (kind == TimeBlock__c.SObjectType) {
      addLinkedChoicePeriods(recordId, found);
    }
    List<ElectiveRun__c> runs = runsUsing(recordId, kind);
    if (!runs.isEmpty()) {
      CampLabels labels = found.labels(runs[0].Season__r.Camp__c);
      List<String> names = namesOf(runs);
      found.parts.add(
        'it has ' +
          labels.singularInSentence('Elective') +
          ' runs: ' +
          InUse.quoted(names)
      );
      found.fixes.add(
        'delete ' + (names.size() == 1 ? 'that run' : 'those runs')
      );
    }
    if (found.parts.isEmpty()) {
      return null;
    }
    return 'This can\'t be deleted yet: ' +
      String.join(found.parts, ', and ') +
      '. First ' +
      String.join(found.fixes, ' and ') +
      ', then delete it.';
  }

  /** What is in the way, and the fix for each, in the same order. */
  private class Reasons {
    List<String> parts = new List<String>();
    List<String> fixes = new List<String>();
    // The camp's words, read once for the whole refusal (a record is in one camp).
    private CampLabels words;

    CampLabels labels(Id campId) {
      if (words == null) {
        words = CampLabels.forCamp(campId);
      }
      return words;
    }
  }

  /** "that elective set" or "those elective sets", in the camp's words. */
  private static String thatOrThose(
    CampLabels labels,
    String term,
    Integer count
  ) {
    return count == 1
      ? 'that ' + labels.singularInSentence(term)
      : 'those ' + labels.pluralInSentence(term);
  }

  private static void addOfferings(Id activityId, Reasons found) {
    List<String> sets = new List<String>();
    Id campId;
    for (Offering__c offering : [
      SELECT ElectiveSet__r.Name, ElectiveSet__r.Season__r.Camp__c
      FROM Offering__c
      WHERE Activity__c = :activityId
      WITH USER_MODE
      ORDER BY ElectiveSet__r.Name, Id
      LIMIT :MAX_ROWS
    ]) {
      sets.add(offering.ElectiveSet__r.Name);
      campId = offering.ElectiveSet__r.Season__r.Camp__c;
    }
    if (sets.isEmpty()) {
      return;
    }
    CampLabels labels = found.labels(campId);
    found.parts.add('it is offered in ' + InUse.quoted(sets));
    found.fixes.add(
      'take it off ' + thatOrThose(labels, 'ElectiveSet', sets.size())
    );
  }

  private static void addLinkedChoiceDivisions(
    Id recordId,
    Schema.SObjectType kind,
    Reasons found
  ) {
    List<String> choices = new List<String>();
    Id campId;
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
    if (choices.isEmpty()) {
      return;
    }
    CampLabels labels = found.labels(campId);
    found.parts.add(
      (kind == Program__c.SObjectType
          ? 'some of its ' + labels.pluralInSentence('Division') + ' are'
          : 'it is') +
        ' named by ' +
        InUse.quoted(choices)
    );
    found.fixes.add(
      'change who ' +
        thatOrThose(labels, 'LinkedChoice', choices.size()) +
        (choices.size() == 1 ? ' is' : ' are') +
        ' for'
    );
  }

  private static void addLinkedChoicePeriods(Id blockId, Reasons found) {
    List<String> choices = new List<String>();
    Id campId;
    for (LinkedChoiceTime__c row : [
      SELECT
        LinkedChoice__r.Name,
        LinkedChoice__r.ElectiveSet__r.Season__r.Camp__c
      FROM LinkedChoiceTime__c
      WHERE TimeBlock__c = :blockId
      WITH USER_MODE
      ORDER BY LinkedChoice__r.Name, Id
      LIMIT :MAX_ROWS
    ]) {
      choices.add(row.LinkedChoice__r.Name);
      campId = row.LinkedChoice__r.ElectiveSet__r.Season__r.Camp__c;
    }
    if (choices.isEmpty()) {
      return;
    }
    CampLabels labels = found.labels(campId);
    found.parts.add('it is a period of ' + InUse.quoted(choices));
    found.fixes.add(
      'take it out of ' + thatOrThose(labels, 'LinkedChoice', choices.size())
    );
  }

  /** The elective runs that use the record, or would lose something with it. */
  private static List<ElectiveRun__c> runsUsing(
    Id recordId,
    Schema.SObjectType kind
  ) {
    List<ElectiveRun__c> runs = runsOfSetup(recordId, kind);
    runs.addAll(runsOfSeats(recordId, kind));
    return runs;
  }

  /** Each run's name once, sorted. */
  private static List<String> namesOf(List<ElectiveRun__c> runs) {
    Map<Id, String> names = new Map<Id, String>();
    for (ElectiveRun__c run : runs) {
      names.put(run.Id, run.Name);
    }
    List<String> result = names.values();
    result.sort();
    return result;
  }

  /** Runs that name the record itself: its week, its schedule's program, its elective set. */
  private static List<ElectiveRun__c> runsOfSetup(
    Id recordId,
    Schema.SObjectType kind
  ) {
    if (kind == Week__c.SObjectType) {
      return [
        SELECT Name, Season__r.Camp__c
        FROM ElectiveRun__c
        WHERE Week__c = :recordId
        WITH USER_MODE
        ORDER BY Name, Id
        LIMIT :MAX_ROWS
      ];
    }
    if (kind == Program__c.SObjectType) {
      return [
        SELECT Name, Season__r.Camp__c
        FROM ElectiveRun__c
        WHERE
          Schedule__r.Program__c = :recordId
          OR FinalSchedule__r.Program__c = :recordId
        WITH USER_MODE
        ORDER BY Name, Id
        LIMIT :MAX_ROWS
      ];
    }
    if (kind == ElectiveSet__c.SObjectType) {
      return [
        SELECT Name, Season__r.Camp__c
        FROM ElectiveRun__c
        WHERE ElectiveSet__c = :recordId
        WITH USER_MODE
        ORDER BY Name, Id
        LIMIT :MAX_ROWS
      ];
    }
    return new List<ElectiveRun__c>();
  }

  /**
   * Runs whose choices or seats name the record: a camper's group that week (or its division), a
   * seat's time block, offering or linked choice. A run's choices are text and name no offering.
   */
  private static List<ElectiveRun__c> runsOfSeats(
    Id recordId,
    Schema.SObjectType kind
  ) {
    List<ElectiveRun__c> runs = new List<ElectiveRun__c>();
    if (kind == Division__c.SObjectType || kind == Group__c.SObjectType) {
      runs.addAll(
        [
          SELECT Name, Season__r.Camp__c
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
        ]
      );
    }
    if (
      kind == Division__c.SObjectType ||
      kind == Group__c.SObjectType ||
      kind == TimeBlock__c.SObjectType ||
      kind == Offering__c.SObjectType ||
      kind == LinkedChoice__c.SObjectType
    ) {
      runs.addAll(
        [
          SELECT Name, Season__r.Camp__c
          FROM ElectiveRun__c
          WHERE
            Id IN (
              SELECT ElectiveRun__c
              FROM Assignment__c
              WHERE
                Group__c = :recordId
                OR Group__r.Division__c = :recordId
                OR TimeBlock__c = :recordId
                OR Offering__c = :recordId
                OR LinkedChoice__c = :recordId
            )
          WITH USER_MODE
          ORDER BY Name, Id
          LIMIT :MAX_ROWS
        ]
      );
    }
    return runs;
  }
}
