/**
 * How many schedules a bunk or an activity is in, so deleting it can say so first (decision 15,
 * Greg 2026-10-17: "Bunk 3 is in 2 schedules. Delete anyway?"; desktop
 * docs/adr/2026-07-30-deleting-a-record-a-schedule-uses.md §1, count first). Every schedule
 * counts: Manual Build and generated drafts, saved versions, and published ones. A schedule's
 * days keep the names they were saved with, so deleting the record leaves them readable.
 * Runs in user mode: only schedules the director can see are counted.
 *
 * The days are listed first (their Ids and dates), then their text is read a few at a time
 * (ScheduleDayTexts), so even days at the longest a part can be stay well inside memory; a
 * schedule already found is not read again. Past the reader's budget, or more days than
 * rowBudget, the count stops and says it is not complete, and the screen says so instead of a
 * number.
 */
public with sharing class ScheduleUses {
  @TestVisible
  private static Integer rowBudget = 40000;

  /** How many schedules name the record, and whether every schedule could be read. */
  public class Count {
    @AuraEnabled
    public Integer schedules = 0;
    @AuraEnabled
    public Boolean complete = true;
  }

  public static Count count(Id recordId) {
    if (recordId == null) {
      return new Count();
    }
    Schema.SObjectType kind = recordId.getSObjectType();
    String key = String.valueOf(recordId).left(15);
    if (kind == Group__c.SObjectType) {
      return read(partsOf(programOf(recordId), null), key);
    }
    if (kind == Activity__c.SObjectType) {
      return read(partsOf(null, seasonOf(recordId)), key);
    }
    return new Count();
  }

  private static Id programOf(Id groupId) {
    List<Group__c> found = [
      SELECT Division__r.Program__c
      FROM Group__c
      WHERE Id = :groupId
      WITH USER_MODE
    ];
    return found.isEmpty() ? null : found[0].Division__r.Program__c;
  }

  private static Id seasonOf(Id activityId) {
    List<Activity__c> found = [
      SELECT Season__c
      FROM Activity__c
      WHERE Id = :activityId
      WITH USER_MODE
    ];
    return found.isEmpty() ? null : found[0].Season__c;
  }

  /** The day parts of the program's (for a bunk) or the season's (for an activity) schedules. */
  private static List<ScheduleDay__c> partsOf(Id programId, Id seasonId) {
    if (programId == null && seasonId == null) {
      return new List<ScheduleDay__c>();
    }
    Integer upTo = rowBudget + 1;
    return [
      SELECT Id, Schedule__c, Date__c
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Program__c = :programId
        OR Schedule__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Schedule__c, Date__c, Part__c
      LIMIT :upTo
    ];
  }

  /**
   * The schedules whose days name the record, by the first 15 characters of its Id (so 15- and
   * 18-character Ids both match), in their groups or items.
   */
  private static Count read(List<ScheduleDay__c> parts, String key) {
    Count result = new Count();
    result.complete = parts.size() <= rowBudget;
    if (!result.complete) {
      return result;
    }
    Naming naming = new Naming(key);
    naming.read(parts);
    result.complete = naming.complete;
    result.schedules = naming.found.size();
    return result;
  }

  /** The schedules a day names the record in; a schedule found is not read again. */
  private with sharing class Naming extends ScheduleDayTexts.Reader {
    private String key;
    private Set<Id> found = new Set<Id>();

    private Naming(String key) {
      this.key = key;
    }

    public override Boolean wants(ScheduleDay__c part) {
      return !found.contains(part.Schedule__c);
    }

    public override void take(List<ScheduleDay__c> parts) {
      if (ScheduleDayTexts.names(parts, key)) {
        found.add(parts[0].Schedule__c);
      }
    }
  }
}
