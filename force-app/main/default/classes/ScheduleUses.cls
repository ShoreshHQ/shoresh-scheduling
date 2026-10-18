/**
 * How many schedules a bunk or an activity is in, so deleting it can say so first (decision 15,
 * Greg 2026-10-17: "Bunk 3 is in 2 schedules. Delete anyway?"; desktop
 * docs/adr/2026-07-30-deleting-a-record-a-schedule-uses.md §1, count first). Every schedule
 * counts: Manual Build and generated drafts, saved versions, and published ones. A schedule's
 * days keep the names they were saved with, so deleting the record leaves them readable.
 * Runs in user mode: only schedules the director can see are counted.
 *
 * The days are listed first (their Ids only), then their text is read a few at a time, so even
 * days at the longest a part can be stay well inside memory; a schedule already found is not read
 * again. The number of queries is capped: past it, or past the rows or text budget, the count
 * stops and says it is not complete, and the screen says so instead of a number.
 */
public with sharing class ScheduleUses {
  // Day parts read at once: 25 at the longest (131,072 characters) is about 3.3 million.
  @TestVisible
  private static Integer partsAtOnce = 25;
  // Queries for the text, after the few that find the season and list the days.
  @TestVisible
  private static Integer queryBudget = 90;
  @TestVisible
  private static Integer rowBudget = 40000;
  @TestVisible
  private static Long textBudget = 60000000;

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
      SELECT Id, Schedule__c
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Program__c = :programId
        OR Schedule__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Schedule__c
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
    Set<Id> found = new Set<Id>();
    Long text = 0;
    Integer queries = 0;
    List<Id> batch = new List<Id>();
    for (Integer i = 0; i < parts.size() && result.complete; i++) {
      if (!found.contains(parts[i].Schedule__c)) {
        batch.add(parts[i].Id);
      }
      if (batch.size() < partsAtOnce && i < parts.size() - 1) {
        continue;
      }
      if (queries == queryBudget || text >= textBudget) {
        result.complete = false;
      } else {
        text += addNaming(batch, key, found);
        queries++;
        batch.clear();
      }
    }
    result.schedules = found.size();
    return result;
  }

  /** Adds the schedules these parts name the record in; returns how much text was read. */
  private static Long addNaming(List<Id> partIds, String key, Set<Id> found) {
    Long read = 0;
    if (partIds.isEmpty()) {
      return read;
    }
    for (ScheduleDay__c part : [
      SELECT Schedule__c, Grid__c
      FROM ScheduleDay__c
      WHERE Id IN :partIds
      WITH USER_MODE
    ]) {
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
