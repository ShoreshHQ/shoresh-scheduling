/**
 * The season's setup as one short stamp (docs/protocol/api.md API-1.80, API-1.81): how many of
 * each thing an import reads or writes (the season's setup, the camp's words and remembered
 * answers, its imports), and when the last of them changed. Any change, addition or deletion since
 * gives another stamp, so a save made from a review of an older setup is refused (AgentImports).
 * Counted, never kept: each kind is a count and a latest time, read in a few queries with the
 * lists inside them (a list inside a query is not a query of its own), walked in loops so a list
 * of any length reads in parts.
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
   * The season and what hangs on it directly: the season, weeks, location types, locations,
   * programs, activities, who recurring activities cover, elective sets, imports.
   */
  private static List<Tally> seasonTallies(Id seasonId) {
    List<Tally> t = fresh(9);
    for (Season__c season : [
      SELECT
        SystemModstamp,
        (SELECT SystemModstamp FROM Weeks__r),
        (SELECT SystemModstamp FROM LocationTypes__r),
        (SELECT SystemModstamp FROM Locations__r),
        (SELECT SystemModstamp FROM Programs__r),
        (SELECT SystemModstamp FROM Activities__r),
        (SELECT SystemModstamp FROM Coverages__r),
        (SELECT SystemModstamp FROM ElectiveSets__r),
        (SELECT SystemModstamp FROM Imports__r)
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ]) {
      t[0].add(season);
      for (SObject record : season.Weeks__r) {
        t[1].add(record);
      }
      for (SObject record : season.LocationTypes__r) {
        t[2].add(record);
      }
      for (SObject record : season.Locations__r) {
        t[3].add(record);
      }
      for (SObject record : season.Programs__r) {
        t[4].add(record);
      }
      for (SObject record : season.Activities__r) {
        t[5].add(record);
      }
      for (SObject record : season.Coverages__r) {
        t[6].add(record);
      }
      for (SObject record : season.ElectiveSets__r) {
        t[7].add(record);
      }
      for (SObject record : season.Imports__r) {
        t[8].add(record);
      }
    }
    return t;
  }

  /**
   * What hangs on the season's weeks, programs, divisions, activities and elective sets: weeks
   * off, divisions, groups, time blocks, fixed and recurring activities, who can do each
   * activity, offerings, linked choices.
   */
  private static List<Tally> insideTallies(Id seasonId) {
    List<Tally> t = fresh(9);
    for (Week__c week : [
      SELECT Id, (SELECT SystemModstamp FROM WeekExceptions__r)
      FROM Week__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      for (SObject record : week.WeekExceptions__r) {
        t[0].add(record);
      }
    }
    for (Division__c division : [
      SELECT SystemModstamp, (SELECT SystemModstamp FROM Groups__r)
      FROM Division__c
      WHERE Program__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      t[1].add(division);
      for (SObject record : division.Groups__r) {
        t[2].add(record);
      }
    }
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
      for (SObject record : program.TimeBlocks__r) {
        t[3].add(record);
      }
      for (SObject record : program.FixedActivities__r) {
        t[4].add(record);
      }
      for (SObject record : program.RecurringActivities__r) {
        t[5].add(record);
      }
    }
    for (Activity__c activity : [
      SELECT Id, (SELECT SystemModstamp FROM Eligibilities__r)
      FROM Activity__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      for (SObject record : activity.Eligibilities__r) {
        t[6].add(record);
      }
    }
    for (ElectiveSet__c electiveSet : [
      SELECT
        Id,
        (SELECT SystemModstamp FROM Offerings__r),
        (SELECT SystemModstamp FROM LinkedChoices__r)
      FROM ElectiveSet__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      for (SObject record : electiveSet.Offerings__r) {
        t[7].add(record);
      }
      for (SObject record : electiveSet.LinkedChoices__r) {
        t[8].add(record);
      }
    }
    return t;
  }

  /** The camp's words and remembered answers, which a review reads too. */
  private static List<Tally> campTallies(Id campId) {
    List<Tally> t = fresh(2);
    for (Camp__c camp : [
      SELECT
        Id,
        (SELECT SystemModstamp FROM CampLabels__r),
        (SELECT SystemModstamp FROM ImportAnswers__r)
      FROM Camp__c
      WHERE Id = :campId
      WITH USER_MODE
    ]) {
      for (SObject record : camp.CampLabels__r) {
        t[0].add(record);
      }
      for (SObject record : camp.ImportAnswers__r) {
        t[1].add(record);
      }
    }
    return t;
  }

  /**
   * Import last year's stamp (API-1.84): the setup's, and also the weeks' schedules and their
   * days (it keeps last year's schedule as a version and may replace an earlier import's cells)
   * and the season's special days and events and their plans (it puts days of their own on).
   */
  public static String withSchedules(Id seasonId, Id campId) {
    List<Tally> t = fresh(6);
    for (Schedule__c schedule : [
      SELECT SystemModstamp, (SELECT SystemModstamp FROM Days__r)
      FROM Schedule__c
      WHERE Program__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      t[0].add(schedule);
      for (SObject record : schedule.Days__r) {
        t[1].add(record);
      }
    }
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
      for (SObject record : season.SpecialDays__r) {
        t[2].add(record);
      }
      for (SObject record : season.SpecialEvents__r) {
        t[3].add(record);
      }
      for (SObject record : season.SpecialDates__r) {
        t[4].add(record);
      }
      for (SObject record : season.PlanParts__r) {
        t[5].add(record);
      }
    }
    return of(seasonId, campId) + digest(t);
  }
}
