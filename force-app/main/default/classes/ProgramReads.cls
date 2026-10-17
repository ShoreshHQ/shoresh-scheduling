/**
 * A program's setup as Manual Build reads it: the program and a week of its season, its time
 * blocks in the order of the day, and its groups in the order the screens list them (the same
 * orders as slice 3b's SetTimePlan). Runs in user mode.
 */
public with sharing class ProgramReads {
  public static Program__c programOf(Id programId) {
    List<Program__c> found = [
      SELECT
        Id,
        Name,
        Season__c,
        Season__r.Camp__c,
        Monday__c,
        Tuesday__c,
        Wednesday__c,
        Thursday__c,
        Friday__c
      FROM Program__c
      WHERE Id = :programId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      throw new ShoreshException(
        'That was not found, or you do not have access to it.'
      );
    }
    return found[0];
  }

  /** A week of the program's season. */
  public static Week__c weekOf(Id weekId, Program__c program) {
    List<Week__c> found = [
      SELECT Id, Name, StartDate__c, EndDate__c, Season__c
      FROM Week__c
      WHERE Id = :weekId
      WITH USER_MODE
    ];
    if (found.isEmpty() || found[0].Season__c != program.Season__c) {
      CampLabels labels = CampLabels.forCamp(program.Season__r.Camp__c);
      throw new ShoreshException(
        'That ' +
          labels.singularInSentence('Week') +
          ' is not in ' +
          program.Name +
          '\'s ' +
          labels.singularInSentence('Season') +
          '.'
      );
    }
    return found[0];
  }

  public static List<TimeBlock__c> blocksOf(Id programId) {
    return [
      SELECT Id, Name, StartTime__c, EndTime__c, PartOfDay__c
      FROM TimeBlock__c
      WHERE Program__c = :programId
      WITH USER_MODE
      ORDER BY StartTime__c, SortOrder__c, Id
    ];
  }

  public static List<Group__c> groupsOf(Id programId) {
    return [
      SELECT Id, Name, Availability__c, Division__c
      FROM Group__c
      WHERE Division__r.Program__c = :programId
      WITH USER_MODE
      ORDER BY
        Division__r.SortOrder__c NULLS LAST,
        Division__r.Name,
        SortOrder__c NULLS LAST,
        Name,
        Id
    ];
  }

  /** The program's groups in order, without those away in the week. */
  public static List<Group__c> groupsAtCamp(Id programId, Id weekId) {
    Set<Id> away = new Set<Id>();
    for (WeekException__c mark : [
      SELECT Group__c
      FROM WeekException__c
      WHERE Week__c = :weekId AND Group__r.Division__r.Program__c = :programId
      WITH USER_MODE
    ]) {
      away.add(mark.Group__c);
    }
    List<Group__c> result = new List<Group__c>();
    for (Group__c grp : groupsOf(programId)) {
      if (!away.contains(grp.Id)) {
        result.add(grp);
      }
    }
    return result;
  }
}
