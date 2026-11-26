/**
 * Reads schedule days' text a few at a time, for the counts that look through many schedules at
 * once (ScheduleUses, GroupPlacements, LinkedChoicePlaces, PlacedInWeeks). The caller lists the day
 * parts first (their Ids, schedules and dates only); their text is then read in batches of about
 * partsAtOnce parts, a day's parts always together, under one budget of queries and text. Past
 * the budget, reading stops and says it is not complete; a day read as a grid that can't be read
 * is said too (unreadable), never counted as nothing (CORE-6.19). In user mode: only schedules
 * the person can see.
 */
public with sharing class ScheduleDayTexts {
  // Day parts read at once: 25 at the longest (131,072 characters) is about 3.3 million.
  @TestVisible
  private static Integer partsAtOnce = 25;
  // Queries for the text: with the few that find what to count and list the days, under the 50 a
  // request may use (half of Salesforce's 100).
  @TestVisible
  private static Integer queryBudget = 40;
  // Never so many that the request has fewer than these left for what follows (a delete).
  private static final Integer ROOM_AFTER = 30;
  // Text read in all, so even days at the longest a part can be stay well inside memory.
  @TestVisible
  private static Long textBudget = 60000000;

  /** A count over schedule days: extend it, then read the days it listed (read). */
  public with sharing abstract class Reader {
    // Every day wanted was read; false when the budget ran out first.
    public Boolean complete = true;
    // A day read as a grid (gridOf) couldn't be read.
    public Boolean unreadable = false;

    /** Whether a day part still needs reading (ScheduleUses: not once its schedule is found). */
    public virtual Boolean wants(ScheduleDay__c part) {
      return true;
    }

    /** One day's parts, in Part__c order, with their text, schedule and week. */
    public abstract void take(List<ScheduleDay__c> parts);

    /**
     * Reads the listed day parts (Id, Schedule__c and Date__c, in Schedule__c, Date__c, Part__c
     * order) a batch at a time, handing each day to take; complete says whether all were read.
     */
    public void read(List<ScheduleDay__c> listed) {
      Integer budget = Math.min(
        queryBudget,
        Limits.getLimitQueries() - Limits.getQueries() - ROOM_AFTER
      );
      Integer queries = 0;
      Long text = 0;
      List<Id> batch = new List<Id>();
      for (Integer i = 0; i < listed.size(); i++) {
        if (wants(listed[i])) {
          batch.add(listed[i].Id);
        }
        // A batch ends only between two days, so a day's parts are always read together.
        Boolean last = i == listed.size() - 1;
        if (
          batch.isEmpty() ||
          (!last &&
          (batch.size() < partsAtOnce || sameDay(listed[i], listed[i + 1])))
        ) {
          continue;
        }
        if (queries >= budget || text >= textBudget) {
          complete = false;
          return;
        }
        text += readBatch(batch);
        queries++;
        batch.clear();
      }
    }

    /** The day as one grid (ScheduleDays.readDay); when it can't be read, its problem and unreadable. */
    public ScheduleDays.DayGrid gridOf(List<ScheduleDay__c> parts) {
      ScheduleDays.DayGrid day = ScheduleDays.readDay(parts[0].Date__c, parts);
      if (day.grid == null) {
        unreadable = true;
      }
      return day;
    }

    /** Reads these parts' text and hands each day to take; returns how much text was read. */
    private Long readBatch(List<Id> partIds) {
      Long read = 0;
      List<ScheduleDay__c> day = new List<ScheduleDay__c>();
      for (ScheduleDay__c part : [
        SELECT
          Id,
          Schedule__c,
          Schedule__r.Week__c,
          Schedule__r.Week__r.Name,
          Date__c,
          Part__c,
          Grid__c,
          GridFormatVersion__c,
          Revision__c
        FROM ScheduleDay__c
        WHERE Id IN :partIds
        WITH USER_MODE
        ORDER BY Schedule__c, Date__c, Part__c
      ]) {
        read += part.Grid__c == null ? 0 : part.Grid__c.length();
        if (!day.isEmpty() && !sameDay(day[0], part)) {
          take(day);
          day = new List<ScheduleDay__c>();
        }
        day.add(part);
      }
      if (!day.isEmpty()) {
        take(day);
      }
      return read;
    }
  }

  /** Whether any of a day's parts names the key (an Id, or its first 15 characters). */
  public static Boolean names(List<ScheduleDay__c> parts, String key) {
    for (ScheduleDay__c part : parts) {
      if (part.Grid__c != null && part.Grid__c.contains(key)) {
        return true;
      }
    }
    return false;
  }

  private static Boolean sameDay(ScheduleDay__c a, ScheduleDay__c b) {
    return a.Schedule__c == b.Schedule__c && a.Date__c == b.Date__c;
  }
}
