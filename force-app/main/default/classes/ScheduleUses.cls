/**
 * How many schedules a bunk or an activity is in, so deleting it can say so first (decision 15,
 * Greg 2026-10-17: "Bunk 3 is in 2 schedules. Delete anyway?"; desktop
 * docs/adr/2026-07-30-deleting-a-record-a-schedule-uses.md §1, count first). Every schedule
 * counts: Manual Build and generated drafts, saved versions, and published ones. A schedule's
 * days keep the names they were saved with, so deleting the record leaves them readable.
 * Runs in user mode: only schedules the director can see are counted.
 *
 * The days are read in one query, 200 at a time (a SOQL for loop), so the number of queries
 * never grows with the season. If the season is too big to read whole (rows or text), the
 * count stops and says it is not complete; the screen then says so instead of a number.
 */
public with sharing class ScheduleUses {
  // Stop well before the limits (rows, time), so the answer always comes back.
  private static final Integer ROW_BUDGET = 40000;
  private static final Long TEXT_BUDGET = 60000000;

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
      return read(programOf(recordId), null, key);
    }
    if (kind == Activity__c.SObjectType) {
      return read(null, seasonOf(recordId), key);
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

  /**
   * The schedules of the program (for a bunk) or the season (for an activity) whose days name
   * the record, by the first 15 characters of its Id (so 15- and 18-character Ids both match),
   * in their groups or items.
   */
  private static Count read(Id programId, Id seasonId, String key) {
    Count result = new Count();
    if (programId == null && seasonId == null) {
      return result;
    }
    Set<Id> found = new Set<Id>();
    Integer rows = 0;
    Long text = 0;
    for (List<ScheduleDay__c> chunk : [
      SELECT Schedule__c, Grid__c
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Program__c = :programId
        OR Schedule__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      text += addNaming(chunk, key, found);
      rows += chunk.size();
      if (rows >= ROW_BUDGET || text >= TEXT_BUDGET) {
        result.complete = false;
        break;
      }
    }
    result.schedules = found.size();
    return result;
  }

  /** Adds the schedules these parts name the record in; returns how much text was read. */
  private static Long addNaming(
    List<ScheduleDay__c> parts,
    String key,
    Set<Id> found
  ) {
    Long read = 0;
    for (ScheduleDay__c part : parts) {
      if (part.Grid__c != null) {
        read += part.Grid__c.length();
        if (part.Grid__c.contains(key)) {
          found.add(part.Schedule__c);
        }
      }
    }
    return read;
  }
}
