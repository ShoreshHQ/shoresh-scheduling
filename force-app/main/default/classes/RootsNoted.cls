/**
 * What an import noted but didn't set up, for Roots' hand (repo ADR 0027; SPECIAL-1.4): the
 * special days and events last year's schedule names ("Field day", "Zoo trip") that the season
 * has no record of yet, each once, in the order the version has them. Read from the season's
 * imported versions, two queries whatever their size; in user mode.
 */
public with sharing class RootsNoted {
  private static final String IMPORTED = 'Imported';
  private static final String VERSION = 'Version';
  // What Roots offers to set up: a special event ('S') or a special day ('D').
  private static final Set<String> KINDS = new Set<String>{ 'S', 'D' };

  public class Noted {
    @AuraEnabled
    public String kind;
    @AuraEnabled
    public String name;
  }

  public static List<Noted> read(Id seasonId) {
    Map<Id, Schedule__c> versions = new Map<Id, Schedule__c>(
      [
        SELECT Id
        FROM Schedule__c
        WHERE
          Week__r.Season__c = :seasonId
          AND Status__c = :VERSION
          AND Origin__c = :IMPORTED
        WITH USER_MODE
        ORDER BY CreatedDate, Id
      ]
    );
    List<Noted> result = new List<Noted>();
    if (versions.isEmpty()) {
      return result;
    }
    List<ScheduleGrid.Item> named = namedItems(
      versions.keySet(),
      ScheduleDays.read(versions.keySet())
    );
    // The season's own names, read only when the versions name something (two queries).
    Set<String> known = named.isEmpty()
      ? new Set<String>()
      : knownNames(seasonId);
    for (ScheduleGrid.Item item : named) {
      if (known.add(NotedItems.loose(item.name))) {
        Noted noted = new Noted();
        noted.kind = item.kind;
        noted.name = item.name.trim();
        result.add(noted);
      }
    }
    return result;
  }

  /** The special days and events the versions name with no record, in the versions' order. */
  private static List<ScheduleGrid.Item> namedItems(
    Set<Id> versionIds,
    Map<Id, List<ScheduleDays.DayGrid>> days
  ) {
    List<ScheduleGrid.Item> result = new List<ScheduleGrid.Item>();
    for (Id versionId : versionIds) {
      for (ScheduleDays.DayGrid day : days.get(versionId)) {
        if (day.grid != null) {
          addNamed(result, day.grid.items);
        }
      }
    }
    return result;
  }

  private static void addNamed(
    List<ScheduleGrid.Item> result,
    List<ScheduleGrid.Item> items
  ) {
    for (ScheduleGrid.Item item : items) {
      if (
        KINDS.contains(item.kind) &&
        String.isBlank(item.id) &&
        String.isNotBlank(NotedItems.loose(item.name))
      ) {
        result.add(item);
      }
    }
  }

  /** The season's special days' and events' names, spaces and capitals aside. */
  private static Set<String> knownNames(Id seasonId) {
    Set<String> result = new Set<String>();
    for (SpecialDay__c day : [
      SELECT Name
      FROM SpecialDay__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      result.add(NotedItems.loose(day.Name));
    }
    for (SpecialEvent__c event : [
      SELECT Name
      FROM SpecialEvent__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      result.add(NotedItems.loose(event.Name));
    }
    return result;
  }
}
