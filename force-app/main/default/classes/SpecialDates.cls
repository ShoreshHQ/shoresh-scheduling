/**
 * Where special days and special events are put (SpecialDate__c, ADR 0014): one row per week and
 * weekday, kept as a weekday so it stays put if the week's dates move (desktop ADR
 * 2026-10-09-special-day-binds-to-a-week-day). Something on several days has a row for each day;
 * there are no date ranges. A special day replaces that day for the whole camp, so a week day
 * holds at most one (SpecialDateTriggerHandler). Reads and writes run in user mode.
 */
public with sharing class SpecialDates {
  private static final Integer MAX_DAYS = 20;

  /** One special day or event on one day. kind: 'D' special day, 'S' special event (grid kinds). */
  public class Placement {
    public Id id;
    public String kind;
    public Id itemId;
    public String itemName;
    public Id weekId;
    public String weekName;
    public String day;
    // The day's date in its week today; null when the week no longer has that weekday.
    public Date onDate;
  }

  /** The season's special days and events on days, by week start then weekday. */
  public static List<Placement> forSeason(Id seasonId) {
    List<Placement> result = new List<Placement>();
    // A picklist sorts in its own order (Monday to Sunday); a day's special day comes first.
    for (SpecialDate__c row : [
      SELECT
        Id,
        Day__c,
        Week__c,
        Week__r.Name,
        Week__r.StartDate__c,
        Week__r.EndDate__c,
        SpecialDay__c,
        SpecialDay__r.Name,
        SpecialEvent__c,
        SpecialEvent__r.Name
      FROM SpecialDate__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY
        Week__r.StartDate__c,
        Week__r.Name,
        Week__c,
        Day__c,
        SpecialEvent__r.Name NULLS FIRST,
        Id
    ]) {
      result.add(placementOf(row));
    }
    return result;
  }

  /** Puts a special day or event on a weekday of a week. Returns the new row's Id. */
  public static Id place(Id itemId, Id weekId, String day) {
    Id seasonId = seasonOf(itemId);
    SpecialDate__c row = new SpecialDate__c(
      Season__c = seasonId,
      Week__c = weekId,
      Day__c = day
    );
    if (itemId.getSObjectType() == SpecialDay__c.SObjectType) {
      row.SpecialDay__c = itemId;
    } else {
      row.SpecialEvent__c = itemId;
    }
    Database.insert(row, true, AccessLevel.USER_MODE);
    return row.Id;
  }

  /** Takes a special day or event off one day. The item and its plan are kept. */
  public static void takeOff(Id specialDateId) {
    Database.delete(
      new SpecialDate__c(Id = specialDateId),
      true,
      AccessLevel.USER_MODE
    );
  }

  /** The date in the week with this weekday ('Monday'), or null when the week has none. */
  public static Date dateOf(Date weekStart, Date weekEnd, String day) {
    if (weekStart == null || weekEnd == null || day == null) {
      return null;
    }
    for (Date d = weekStart; d <= weekEnd; d = d.addDays(1)) {
      if (WeekCalendar.weekdayName(d) == day) {
        return d;
      }
    }
    return null;
  }

  /**
   * For each special day or event that is on a day, why it can't be deleted, naming the days in
   * the camp's words; items on no day are left out. System mode: the refusal must count every
   * day it is on, and the restrict-delete lookups would refuse anyway.
   */
  public static Map<Id, String> whereItemsAre(Set<Id> itemIds) {
    Map<Id, List<Placement>> byItem = new Map<Id, List<Placement>>();
    Map<Id, Id> seasonByItem = new Map<Id, Id>();
    for (SpecialDate__c row : [
      SELECT
        Id,
        Season__c,
        Day__c,
        Week__c,
        Week__r.Name,
        Week__r.StartDate__c,
        Week__r.EndDate__c,
        SpecialDay__c,
        SpecialDay__r.Name,
        SpecialEvent__c,
        SpecialEvent__r.Name
      FROM SpecialDate__c
      WHERE SpecialDay__c IN :itemIds OR SpecialEvent__c IN :itemIds
      WITH SYSTEM_MODE
      ORDER BY Week__r.StartDate__c, Week__r.Name, Week__c, Day__c, Id
    ]) {
      Placement placed = placementOf(row);
      if (!byItem.containsKey(placed.itemId)) {
        byItem.put(placed.itemId, new List<Placement>());
      }
      byItem.get(placed.itemId).add(placed);
      seasonByItem.put(placed.itemId, row.Season__c);
    }
    Map<Id, String> result = new Map<Id, String>();
    if (byItem.isEmpty()) {
      return result;
    }
    Map<Id, CampLabels> labelsBySeason = SetupSeasons.labelsBySeason(
      new Set<Id>(seasonByItem.values())
    );
    for (Id itemId : byItem.keySet()) {
      result.put(
        itemId,
        refusal(
          labelsBySeason.get(seasonByItem.get(itemId)),
          itemId.getSObjectType(),
          byItem.get(itemId)
        )
      );
    }
    return result;
  }

  /**
   * 'This special day can't be deleted yet: it is on Tuesday of "Week 2" and Thursday of
   * "Week 5". First take it off those days, then delete it.'
   */
  private static String refusal(
    CampLabels labels,
    Schema.SObjectType type,
    List<Placement> days
  ) {
    List<String> named = new List<String>();
    for (Integer i = 0; i < Math.min(days.size(), MAX_DAYS); i++) {
      named.add(onDay(days[i].day, days[i].weekName));
    }
    if (days.size() > MAX_DAYS) {
      named.add('more');
    }
    String last = named.remove(named.size() - 1);
    String listed = named.isEmpty()
      ? last
      : String.join(named, ', ') + ' and ' + last;
    return 'This ' +
      labels.singularInSentence(SpecialItemTriggerHandler.termOf(type)) +
      ' can\'t be deleted yet: it is on ' +
      listed +
      '. First take it off ' +
      (days.size() == 1 ? 'that day' : 'those days') +
      ', then delete it.';
  }

  /** 'Tuesday of "Week 2"'. */
  public static String onDay(String day, String weekName) {
    return day + ' of "' + weekName + '"';
  }

  private static Placement placementOf(SpecialDate__c row) {
    Placement placed = new Placement();
    placed.id = row.Id;
    placed.day = row.Day__c;
    placed.weekId = row.Week__c;
    placed.weekName = row.Week__r.Name;
    placed.onDate = dateOf(
      row.Week__r.StartDate__c,
      row.Week__r.EndDate__c,
      row.Day__c
    );
    if (row.SpecialDay__c != null) {
      placed.kind = 'D';
      placed.itemId = row.SpecialDay__c;
      placed.itemName = row.SpecialDay__r.Name;
    } else {
      placed.kind = 'S';
      placed.itemId = row.SpecialEvent__c;
      placed.itemName = row.SpecialEvent__r.Name;
    }
    return placed;
  }

  /** The season of a special day or event; refused plainly when it isn't one or can't be seen. */
  private static Id seasonOf(Id itemId) {
    Schema.SObjectType type = itemId?.getSObjectType();
    List<SObject> found = new List<SObject>();
    // Without access to the object, it is "not found", never a platform error.
    if (
      type == SpecialDay__c.SObjectType &&
      Schema.sObjectType.SpecialDay__c.isAccessible()
    ) {
      found = [
        SELECT Season__c
        FROM SpecialDay__c
        WHERE Id = :itemId
        WITH USER_MODE
      ];
    } else if (
      type == SpecialEvent__c.SObjectType &&
      Schema.sObjectType.SpecialEvent__c.isAccessible()
    ) {
      found = [
        SELECT Season__c
        FROM SpecialEvent__c
        WHERE Id = :itemId
        WITH USER_MODE
      ];
    }
    if (found.isEmpty()) {
      throw new ShoreshException(
        'That was not found, or you don\'t have access to it. Reload the page.'
      );
    }
    return type == SpecialDay__c.SObjectType
      ? ((SpecialDay__c) found[0]).Season__c
      : ((SpecialEvent__c) found[0]).Season__c;
  }
}
