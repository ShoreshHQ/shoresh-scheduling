/**
 * The season's setup as one short stamp (docs/protocol/api.md API-1.80, API-1.81): how many of
 * each thing an import reads or writes (the season's setup, the camp's words and remembered
 * answers, its imports), and when the last of them changed. Any change, addition or deletion since
 * gives another stamp, so a save made from a review of an older setup is refused (AgentImports).
 * Counted, never kept: each kind is a count and a latest time, read in a few queries with the
 * lists inside them (a list inside a query is not a query of its own).
 */
public with sharing class AgentImportStamp {
  /** How many of one kind there are, and when the last of them changed. */
  private class Tally {
    private Integer n = 0;
    private Datetime at;

    private void add(SObject record) {
      n++;
      Datetime saved = (Datetime) record.get('SystemModstamp');
      if (at == null || saved > at) {
        at = saved;
      }
    }

    private String part() {
      return n + '@' + (at == null ? '' : String.valueOf(at.getTime()));
    }
  }

  /** The stamp: 16 letters and digits. */
  public static String of(Id seasonId, Id campId) {
    List<Tally> kinds = new List<Tally>();
    kinds.addAll(seasonTallies(seasonId));
    kinds.addAll(insideTallies(seasonId));
    kinds.addAll(campTallies(campId));
    return digest(kinds);
  }

  /** Tallies as 16 letters and digits. */
  private static String digest(List<Tally> kinds) {
    List<String> parts = new List<String>();
    for (Tally kind : kinds) {
      parts.add(kind.part());
    }
    return EncodingUtil.convertToHex(
        Crypto.generateDigest('SHA-256', Blob.valueOf(String.join(parts, '|')))
      )
      .left(16);
  }

  private static List<Tally> fresh(Integer count) {
    List<Tally> result = new List<Tally>();
    for (Integer i = 0; i < count; i++) {
      result.add(new Tally());
    }
    return result;
  }

  /**
   * The relationship names, from the platform, of the lists inside a record, by the field each
   * child points at it with.
   */
  private static List<String> inside(
    Schema.SObjectType parent,
    List<Schema.SObjectField> children
  ) {
    List<String> names = new List<String>();
    for (Schema.SObjectField child : children) {
      names.add(ShoreshSchema.childRelationship(parent, child));
    }
    return names;
  }

  /** Tallies each list inside a record read into its own tally, in order. */
  private static void addInside(
    List<Tally> lists,
    SObject parent,
    List<String> relationships
  ) {
    for (Integer i = 0; i < relationships.size(); i++) {
      // Walked in a loop, never held as a list: a list of any length reads in parts.
      for (SObject record : parent.getSObjects(relationships[i])) {
        lists[i].add(record);
      }
    }
  }

  /** The tallies one after another. */
  private static List<Tally> joined(List<List<Tally>> parts) {
    List<Tally> result = new List<Tally>();
    for (List<Tally> part : parts) {
      result.addAll(part);
    }
    return result;
  }

  /**
   * The season and what hangs on it directly: the season, weeks, location types, locations,
   * staff, programs, activities, who recurring activities cover, elective sets, imports.
   */
  private static List<Tally> seasonTallies(Id seasonId) {
    List<Tally> own = fresh(1);
    List<Tally> lists = fresh(9);
    List<String> relationships = inside(
      Season__c.SObjectType,
      new List<Schema.SObjectField>{
        Week__c.Season__c,
        LocationType__c.Season__c,
        Location__c.Season__c,
        StaffMember__c.Season__c,
        Program__c.Season__c,
        Activity__c.Season__c,
        Coverage__c.Season__c,
        ElectiveSet__c.Season__c,
        Import__c.Season__c
      }
    );
    for (Season__c season : [
      SELECT
        SystemModstamp,
        (SELECT SystemModstamp FROM Weeks__r),
        (SELECT SystemModstamp FROM LocationTypes__r),
        (SELECT SystemModstamp FROM Locations__r),
        (SELECT SystemModstamp FROM StaffMembers__r),
        (SELECT SystemModstamp FROM Programs__r),
        (SELECT SystemModstamp FROM Activities__r),
        (SELECT SystemModstamp FROM Coverages__r),
        (SELECT SystemModstamp FROM ElectiveSets__r),
        (SELECT SystemModstamp FROM Imports__r)
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ]) {
      own[0].add(season);
      addInside(lists, season, relationships);
    }
    return joined(new List<List<Tally>>{ own, lists });
  }

  /**
   * What hangs on the season's weeks, programs, divisions, activities and elective sets: weeks
   * off, divisions, groups, time blocks, fixed and recurring activities, who can do each
   * activity, offerings, linked choices.
   */
  private static List<Tally> insideTallies(Id seasonId) {
    List<Tally> weekOffTally = fresh(1);
    List<Tally> divisionTally = fresh(1);
    List<Tally> groupTally = fresh(1);
    List<Tally> itemTallies = fresh(3);
    List<Tally> eligibilityTally = fresh(1);
    List<Tally> electiveTallies = fresh(2);
    List<String> weekOffs = inside(
      Week__c.SObjectType,
      new List<Schema.SObjectField>{ WeekException__c.Week__c }
    );
    for (Week__c week : [
      SELECT Id, (SELECT SystemModstamp FROM WeekExceptions__r)
      FROM Week__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      addInside(weekOffTally, week, weekOffs);
    }
    List<String> groups = inside(
      Division__c.SObjectType,
      new List<Schema.SObjectField>{ Group__c.Division__c }
    );
    for (Division__c division : [
      SELECT SystemModstamp, (SELECT SystemModstamp FROM Groups__r)
      FROM Division__c
      WHERE Program__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      divisionTally[0].add(division);
      addInside(groupTally, division, groups);
    }
    List<String> items = inside(
      Program__c.SObjectType,
      new List<Schema.SObjectField>{
        TimeBlock__c.Program__c,
        FixedActivity__c.Program__c,
        RecurringActivity__c.Program__c
      }
    );
    for (Program__c program : [
      SELECT
        Id,
        (SELECT SystemModstamp FROM TimeBlocks__r),
        (SELECT SystemModstamp FROM FixedActivities__r),
        (SELECT SystemModstamp FROM RecurringActivities__r)
      FROM Program__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      addInside(itemTallies, program, items);
    }
    List<String> eligibilities = inside(
      Activity__c.SObjectType,
      new List<Schema.SObjectField>{ ActivityEligibility__c.Activity__c }
    );
    for (Activity__c activity : [
      SELECT Id, (SELECT SystemModstamp FROM Eligibilities__r)
      FROM Activity__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      addInside(eligibilityTally, activity, eligibilities);
    }
    List<String> electives = inside(
      ElectiveSet__c.SObjectType,
      new List<Schema.SObjectField>{
        Offering__c.ElectiveSet__c,
        LinkedChoice__c.ElectiveSet__c
      }
    );
    for (ElectiveSet__c electiveSet : [
      SELECT
        Id,
        (SELECT SystemModstamp FROM Offerings__r),
        (SELECT SystemModstamp FROM LinkedChoices__r)
      FROM ElectiveSet__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      addInside(electiveTallies, electiveSet, electives);
    }
    return joined(
      new List<List<Tally>>{
        weekOffTally,
        divisionTally,
        groupTally,
        itemTallies,
        eligibilityTally,
        electiveTallies
      }
    );
  }

  /** The camp's words and remembered answers, which a review reads too. */
  private static List<Tally> campTallies(Id campId) {
    List<Tally> t = fresh(2);
    List<String> relationships = inside(
      Camp__c.SObjectType,
      new List<Schema.SObjectField>{
        CampLabel__c.Camp__c,
        ImportAnswer__c.Camp__c
      }
    );
    for (Camp__c camp : [
      SELECT
        Id,
        (SELECT SystemModstamp FROM CampLabels__r),
        (SELECT SystemModstamp FROM ImportAnswers__r)
      FROM Camp__c
      WHERE Id = :campId
      WITH USER_MODE
    ]) {
      addInside(t, camp, relationships);
    }
    return t;
  }

  /**
   * Import last year's stamp (API-1.84): the setup's, and also the weeks' schedules and their
   * days (it keeps last year's schedule as a version and may replace an earlier import's cells)
   * and the season's special days and events and their plans (it puts days of their own on).
   */
  public static String withSchedules(Id seasonId, Id campId) {
    List<Tally> schedules = fresh(1);
    List<Tally> days = fresh(1);
    List<Tally> specials = fresh(4);
    List<String> inSchedule = inside(
      Schedule__c.SObjectType,
      new List<Schema.SObjectField>{ ScheduleDay__c.Schedule__c }
    );
    for (Schedule__c schedule : [
      SELECT SystemModstamp, (SELECT SystemModstamp FROM Days__r)
      FROM Schedule__c
      WHERE Program__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      schedules[0].add(schedule);
      addInside(days, schedule, inSchedule);
    }
    List<String> onSeason = inside(
      Season__c.SObjectType,
      new List<Schema.SObjectField>{
        SpecialDay__c.Season__c,
        SpecialEvent__c.Season__c,
        SpecialDate__c.Season__c,
        PlanPart__c.Season__c
      }
    );
    for (Season__c season : [
      SELECT
        Id,
        (SELECT SystemModstamp FROM SpecialDays__r),
        (SELECT SystemModstamp FROM SpecialEvents__r),
        (SELECT SystemModstamp FROM SpecialDates__r),
        (SELECT SystemModstamp FROM PlanParts__r)
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ]) {
      addInside(specials, season, onSeason);
    }
    return of(seasonId, campId) +
      digest(joined(new List<List<Tally>>{ schedules, days, specials }));
  }
}
