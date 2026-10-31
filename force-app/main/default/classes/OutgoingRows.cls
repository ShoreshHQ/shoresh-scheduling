/**
 * What every outgoing capability shares (OutgoingDoors and the four capabilities): the season
 * and week asked for, found by the names the camp uses, and rows as a CSV file.
 */
public with sharing class OutgoingRows {
  /**
   * The one season of this name the user can see (as an incoming batch finds it). No name: the
   * season Shoresh's screens open on (seasonToOpen). A name that isn't there is refused with the
   * names that are, so no one has to guess (API-1.25).
   */
  public static Season__c seasonCalled(String name) {
    if (String.isBlank(name)) {
      return seasonToOpen();
    }
    String given = name.normalizeSpace();
    List<Season__c> found = [
      SELECT Id, Name
      FROM Season__c
      WHERE Name = :given
      WITH USER_MODE
      LIMIT 2
    ];
    if (found.size() == 1) {
      return found[0];
    }
    throw new ShoreshException(
      found.isEmpty()
        ? 'There is no season called "' +
          given.left(80) +
          '" that this user can see. ' +
          seasonsSaid()
        : 'More than one season is called "' +
          given.left(80) +
          '". Rename one in Shoresh, then ask again.'
    );
  }

  /**
   * The seasons the user can see, as the screens list them: camp by name, newest first. Which
   * seasons is the user's own sharing; their camp and dates are read for ordering and naming only,
   * in system mode on purpose, since a key may be given the season's name and nothing else.
   */
  public static List<Season__c> seasonsSeen() {
    Map<Id, Season__c> seen = new Map<Id, Season__c>(
      [SELECT Id FROM Season__c WITH USER_MODE LIMIT 200]
    );
    Set<Id> ids = seen.keySet();
    return [
      SELECT Id, Name, Camp__c, Camp__r.Name, StartDate__c, EndDate__c
      FROM Season__c
      WHERE Id IN :ids
      WITH SYSTEM_MODE
      ORDER BY Camp__r.Name, StartDate__c DESC NULLS LAST, Name
    ];
  }

  /**
   * The season Shoresh's screens open on (Camp Setup: the first camp by name, then its season
   * with the latest start), or refused naming the seasons when that isn't one season: that camp
   * has none, or two of its seasons start the same day (API-1.24).
   */
  public static Season__c seasonToOpen() {
    List<Season__c> seen = seasonsSeen();
    Id camp = firstCamp(seen);
    List<Season__c> its = new List<Season__c>();
    for (Season__c season : seen) {
      if (season.Camp__c == camp) {
        its.add(season);
      }
    }
    if (
      !its.isEmpty() &&
      (its.size() == 1 ||
      its[0].StartDate__c != its[1].StartDate__c)
    ) {
      return its[0];
    }
    throw new ShoreshException(
      seen.isEmpty()
        ? 'This user can\'t see any season in Shoresh.'
        : 'Say which season (season). ' + seasonsSaid()
    );
  }

  /** The camp the screens open on: the first by name the user can see. */
  private static Id firstCamp(List<Season__c> seen) {
    try {
      for (Camp__c camp : [
        SELECT Id
        FROM Camp__c
        WITH USER_MODE
        ORDER BY Name
        LIMIT 1
      ]) {
        return camp.Id;
      }
    } catch (QueryException e) {
      // A key may see seasons but not camps: their seasons' first camp, in the same order.
      return seen.isEmpty() ? null : seen[0].Camp__c;
    }
    return null;
  }

  /** "Seasons this user can see: Summer 2026, Summer 2025." */
  public static String seasonsSaid() {
    List<Season__c> seen = seasonsSeen();
    Set<Id> camps = new Set<Id>();
    for (Season__c season : seen) {
      camps.add(season.Camp__c);
    }
    List<String> names = new List<String>();
    for (Season__c season : seen) {
      names.add(
        season.Name + (camps.size() > 1 ? ' (' + season.Camp__r.Name + ')' : '')
      );
    }
    return names.isEmpty()
      ? 'This user can\'t see any season.'
      : 'Seasons this user can see: ' + String.join(names, ', ') + '.';
  }

  /** The season's week of that name, or refused with the season's weeks (API-1.25). */
  public static Week__c weekIn(Season__c season, String week) {
    requireWeek(week);
    List<Week__c> weeks = [
      SELECT Id, Name
      FROM Week__c
      WHERE Season__c = :season.Id
      WITH USER_MODE
      ORDER BY SortOrder__c, StartDate__c
    ];
    List<String> names = new List<String>();
    for (Week__c each : weeks) {
      if (sameWeek(each.Name, week)) {
        return each;
      }
      names.add(each.Name);
    }
    throw new ShoreshException(
      'There is no week called "' +
        week.normalizeSpace().left(80) +
        '" in ' +
        season.Name +
        '. ' +
        (names.isEmpty()
          ? 'It has no weeks yet.'
          : 'Its weeks: ' + String.join(names, ', ') + '.')
    );
  }

  /** The rows as a CSV file: a header of the plain field names, then one line per record. */
  public static String csvOf(
    List<String> fields,
    List<Map<String, Object>> rows
  ) {
    List<String> lines = new List<String>{ String.join(fields, ',') };
    for (Map<String, Object> row : rows) {
      List<String> cells = new List<String>();
      for (String field : fields) {
        Object value = row.get(field);
        String text = value == null ? '' : String.valueOf(value);
        // A cell a spreadsheet would run as a formula is kept as text.
        if (text.length() > 0 && '=+-@\t\r'.contains(text.left(1))) {
          text = '\'' + text;
        }
        cells.add(
          text.containsAny(',"\n\r')
            ? '"' + text.replace('"', '""') + '"'
            : text
        );
      }
      lines.add(String.join(cells, ','));
    }
    return String.join(lines, '\n') + '\n';
  }

  /** The week as the camp names it, spacing and capitals aside (as incoming batches match). */
  public static Boolean sameWeek(String a, String b) {
    return IncomingBatch.fold(a) == IncomingBatch.fold(b);
  }

  /** Every capability needs a week except offerings; asked for in plain words. */
  public static void requireWeek(String week) {
    if (String.isBlank(week)) {
      throw new ShoreshException('Say which week (week).');
    }
  }
}
