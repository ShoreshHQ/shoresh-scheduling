/**
 * Keeps each special event's days (SpecialDate__c, ADR 0014) in step with the week grids it is
 * placed on (slice 4): an event is on a week's weekday while a draft schedule of that week (Manual
 * Build or Generated, any program) holds it that day. So the Special events screen's "Placed on"
 * and the refusal to delete an event that is on a day (ADR 0014 choice 8) see the grids, however
 * the cells were written (a hand edit, Paste, Copy day to, Restore, Set it up...). Versions and
 * published copies are history and don't count.
 *
 * Called after schedule days are saved or deleted, and by DeletedDrafts when a draft or its program
 * is deleted or restored (its days go and come back with no trigger of their own). A save whose
 * days hold no special event, before or after, costs nothing; one that does costs four queries and
 * a write of the days that changed.
 * An event the grid holds that is since deleted (or of another season) is on no day.
 * Runs in user mode: whoever may place an event may put it on a day.
 */
public with sharing class SpecialEventDays {
  // A placed special event in a stored grid's item list: ["S","<its Id>",...] (one not set up
  // yet has no Id: ["S","",...]).
  private static final Pattern PLACED_EVENT = Pattern.compile('\\["S","[^"]');
  // The weekdays a special date can be on (SpecialDate__c.Day__c).
  private static final Set<String> WEEKDAYS = new Set<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  };

  /** After schedule days are inserted, updated or deleted (olds null on insert, news on delete). */
  public static void afterDays(
    List<ScheduleDay__c> news,
    List<ScheduleDay__c> olds
  ) {
    Set<Id> scheduleIds = new Set<Id>();
    for (
      List<ScheduleDay__c> rows : new List<List<ScheduleDay__c>>{ news, olds }
    ) {
      for (
        ScheduleDay__c row : rows == null ? new List<ScheduleDay__c>() : rows
      ) {
        if (holdsEvent(row.Grid__c)) {
          scheduleIds.add(row.Schedule__c);
        }
      }
    }
    if (
      scheduleIds.isEmpty() || !Schema.sObjectType.SpecialDate__c.isCreateable()
    ) {
      return;
    }
    Set<Id> weekIds = new Set<Id>();
    for (Schedule__c schedule : [
      SELECT Week__c
      FROM Schedule__c
      WHERE Id IN :scheduleIds AND Status__c = :ManualDrafts.DRAFT
      WITH USER_MODE
    ]) {
      weekIds.add(schedule.Week__c);
    }
    if (!weekIds.isEmpty()) {
      sync(weekIds);
    }
  }

  /** Whether a stored grid (or part of one) holds a placed special event. */
  @TestVisible
  private static Boolean holdsEvent(String gridText) {
    return gridText != null && PLACED_EVENT.matcher(gridText).find();
  }

  /** The weeks' event days made what their drafts hold. */
  public static void sync(Set<Id> weekIds) {
    // What the drafts hold: "weekId|Friday|eventId", with the season of each week.
    Map<String, SpecialDate__c> wanted = new Map<String, SpecialDate__c>();
    for (ScheduleDay__c part : [
      SELECT
        Date__c,
        Grid__c,
        Schedule__r.Week__c,
        Schedule__r.Week__r.StartDate__c,
        Schedule__r.Week__r.EndDate__c,
        Schedule__r.Program__r.Season__c
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Week__c IN :weekIds
        AND Schedule__r.Status__c = :ManualDrafts.DRAFT
      WITH USER_MODE
    ]) {
      addEvents(part, wanted);
    }
    List<SpecialDate__c> stale = new List<SpecialDate__c>();
    for (SpecialDate__c existing : [
      SELECT Id, Week__c, Day__c, SpecialEvent__c
      FROM SpecialDate__c
      WHERE Week__c IN :weekIds AND SpecialEvent__c != NULL
      WITH USER_MODE
    ]) {
      String key = keyOf(
        existing.Week__c,
        existing.Day__c,
        existing.SpecialEvent__c
      );
      if (wanted.containsKey(key)) {
        wanted.remove(key);
      } else {
        stale.add(existing);
      }
    }
    if (!stale.isEmpty()) {
      Database.delete(stale, true, AccessLevel.USER_MODE);
    }
    keepStandingEvents(wanted);
    if (!wanted.isEmpty()) {
      Database.insert(wanted.values(), true, AccessLevel.USER_MODE);
    }
  }

  /**
   * Leaves out an event since deleted, or of another season: a grid can still hold one (a
   * version restored from before it was deleted, say). It shows as removed on the grid and is on
   * no day; it never stops the save.
   */
  private static void keepStandingEvents(Map<String, SpecialDate__c> wanted) {
    if (wanted.isEmpty()) {
      return;
    }
    Set<Id> eventIds = new Set<Id>();
    for (SpecialDate__c placed : wanted.values()) {
      eventIds.add(placed.SpecialEvent__c);
    }
    Map<Id, SpecialEvent__c> standing = new Map<Id, SpecialEvent__c>(
      [
        SELECT Id, Season__c
        FROM SpecialEvent__c
        WHERE Id IN :eventIds
        WITH USER_MODE
      ]
    );
    for (String key : new List<String>(wanted.keySet())) {
      SpecialDate__c placed = wanted.get(key);
      SpecialEvent__c event = standing.get(placed.SpecialEvent__c);
      if (event == null || event.Season__c != placed.Season__c) {
        wanted.remove(key);
      }
    }
  }

  /** The placed events of one stored part of a draft's day. */
  private static void addEvents(
    ScheduleDay__c part,
    Map<String, SpecialDate__c> wanted
  ) {
    if (!holdsEvent(part.Grid__c)) {
      return;
    }
    String day = WeekCalendar.weekdayName(part.Date__c);
    Week__c week = part.Schedule__r.Week__r;
    // Only a weekday the week has (a week whose dates moved keeps old days: nothing to show).
    if (
      !WEEKDAYS.contains(day) ||
      SpecialDates.dateOf(week.StartDate__c, week.EndDate__c, day) == null
    ) {
      return;
    }
    ScheduleGrid grid;
    try {
      grid = ScheduleGrid.fromText(part.Grid__c);
    } catch (Exception e) {
      // A part that can't be read shows as such on its screen; it puts nothing on a day.
      return;
    }
    for (ScheduleGrid.Item item : grid.items) {
      Id eventId = SlotIds.eventIn('S:' + (item.kind == 'S' ? item.id : ''));
      if (eventId == null) {
        continue;
      }
      String key = keyOf(part.Schedule__r.Week__c, day, eventId);
      if (!wanted.containsKey(key)) {
        wanted.put(
          key,
          new SpecialDate__c(
            Season__c = part.Schedule__r.Program__r.Season__c,
            Week__c = part.Schedule__r.Week__c,
            Day__c = day,
            SpecialEvent__c = eventId
          )
        );
      }
    }
  }

  private static String keyOf(Id weekId, String day, Id eventId) {
    return weekId + '|' + day + '|' + eventId;
  }
}
