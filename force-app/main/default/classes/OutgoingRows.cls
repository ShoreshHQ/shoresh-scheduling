/**
 * What every outgoing capability shares (OutgoingDoors and the four capabilities): the season
 * and week asked for, found by the names the camp uses, and rows as a CSV file.
 */
public with sharing class OutgoingRows {
  /** The one season of this name the user can see (as an incoming batch finds it). */
  public static Season__c seasonCalled(String name) {
    if (String.isBlank(name)) {
      throw new ShoreshException('Say which season (season).');
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
          '" that this user can see.'
        : 'More than one season is called "' +
          given.left(80) +
          '". Rename one in Shoresh, then ask again.'
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
