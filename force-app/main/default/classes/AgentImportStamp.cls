/**
 * The season's setup as one short stamp (docs/protocol/api.md API-1.80, API-1.81): how many of
 * each thing an import reads or writes (the season's setup, the camp's words and remembered
 * answers, its imports), and when the last of them changed. Any change, addition or deletion since
 * gives another stamp, so a save made from a review of an older setup is refused (AgentImports).
 * Counted, never listed, so a camp of any size reads the same way.
 */
public with sharing class AgentImportStamp {
  /** The stamp: 16 letters and digits. */
  public static String of(Id seasonId, Id campId) {
    List<AggregateResult> rows = new List<AggregateResult>();
    rows.addAll(seasonRows(seasonId));
    rows.addAll(insideRows(seasonId));
    rows.addAll(campRows(campId));
    return digest(rows);
  }

  /** Rows as 16 letters and digits. */
  private static String digest(List<AggregateResult> rows) {
    List<String> parts = new List<String>();
    for (AggregateResult row : rows) {
      Datetime at = (Datetime) row.get('at');
      parts.add(
        row.get('n') + '@' + (at == null ? '' : String.valueOf(at.getTime()))
      );
    }
    return EncodingUtil.convertToHex(
        Crypto.generateDigest('SHA-256', Blob.valueOf(String.join(parts, '|')))
      )
      .left(16);
  }

  /** The season and what hangs on it directly. */
  private static List<AggregateResult> seasonRows(Id seasonId) {
    List<AggregateResult> rows = new List<AggregateResult>();
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM Season__c
        WHERE Id = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM Week__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM LocationType__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM Location__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM Program__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM Activity__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM Coverage__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM ElectiveSet__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM Import__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    return rows;
  }

  /** What hangs on the season's weeks, programs, divisions, activities and elective sets. */
  private static List<AggregateResult> insideRows(Id seasonId) {
    List<AggregateResult> rows = new List<AggregateResult>();
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM WeekException__c
        WHERE Week__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM Division__c
        WHERE Program__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM Group__c
        WHERE Division__r.Program__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM TimeBlock__c
        WHERE Program__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM FixedActivity__c
        WHERE Program__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM RecurringActivity__c
        WHERE Program__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM ActivityEligibility__c
        WHERE Activity__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM Offering__c
        WHERE ElectiveSet__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM LinkedChoice__c
        WHERE ElectiveSet__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    return rows;
  }

  /** The camp's words and remembered answers, which a review reads too. */
  private static List<AggregateResult> campRows(Id campId) {
    List<AggregateResult> rows = new List<AggregateResult>();
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM CampLabel__c
        WHERE Camp__c = :campId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM ImportAnswer__c
        WHERE Camp__c = :campId
        WITH USER_MODE
      ]
    );
    return rows;
  }

  /**
   * Import last year's stamp (API-1.84): the setup's, and also the weeks' schedules and their
   * days (it keeps last year's schedule as a version and may replace an earlier import's cells)
   * and the season's special days and events (it puts days of their own on).
   */
  public static String withSchedules(Id seasonId, Id campId) {
    List<AggregateResult> rows = new List<AggregateResult>();
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM Schedule__c
        WHERE Program__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM ScheduleDay__c
        WHERE Schedule__r.Program__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM SpecialDay__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM SpecialEvent__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    rows.addAll(
      [
        SELECT COUNT(Id) n, MAX(SystemModstamp) at
        FROM SpecialDate__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    return of(seasonId, campId) + digest(rows);
  }
}
