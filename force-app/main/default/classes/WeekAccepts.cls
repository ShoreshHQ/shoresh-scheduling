/**
 * The week's accepted counter lines, kept with the week (Schedule__c.AcceptedLines__c, CORE-6.8,
 * Greg 2026-10-30): an Accept on Manual Build or Generated Schedule stays for anyone who opens the
 * week later, and the line still comes back when it gets worse (c/shoreshWeekChecks decides that;
 * the server only keeps what it is sent). Each line is { k: its key, s: what makes it the same
 * line or null, n: how far off it was or null }. A Generated build clears them (GeneratedSaves),
 * as the desktop's Rebuild clears set-aside findings. Reads and writes run in user mode.
 */
public with sharing class WeekAccepts {
  @TestVisible
  private static final Integer MOST_LINES = 500;
  private static final Integer LONGEST_LINE = 2000;

  /** The week's accepted lines as stored ('[]' when none), for the counter to read. */
  @AuraEnabled
  public static String accepted(Id scheduleId) {
    try {
      List<Schedule__c> found = [
        SELECT AcceptedLines__c
        FROM Schedule__c
        WHERE Id = :scheduleId
        WITH USER_MODE
      ];
      return found.isEmpty()
        ? '[]'
        : JSON.serialize(linesOf(found[0].AcceptedLines__c));
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /**
   * Keeps one more accepted line with the week (line: { k, s, n } as JSON), in place of an
   * earlier accept of the same line, under the week's lock so two directors accepting at once
   * both stay. Returns them all.
   */
  @AuraEnabled
  public static String accept(Id scheduleId, String line) {
    Map<String, Object> one = oneLine(line);
    if (one == null) {
      throw ScreenErrors.of('That line could not be accepted.');
    }
    try {
      List<Schedule__c> found = [
        SELECT AcceptedLines__c
        FROM Schedule__c
        WHERE Id = :scheduleId
        WITH USER_MODE
        FOR UPDATE
      ];
      if (found.isEmpty()) {
        throw ScreenErrors.of(
          'That schedule was not found, or you do not have access to it.'
        );
      }
      String text = withLine(linesOf(found[0].AcceptedLines__c), one);
      UserModeWrites.save(
        new List<SObject>{
          new Schedule__c(Id = scheduleId, AcceptedLines__c = text)
        }
      );
      return text;
    } catch (AuraHandledException e) {
      throw e;
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** The lines with one more, in place of the same line; the oldest go when too many to keep. */
  private static String withLine(
    List<Map<String, Object>> lines,
    Map<String, Object> one
  ) {
    List<Map<String, Object>> kept = new List<Map<String, Object>>();
    for (Map<String, Object> line : lines) {
      if (!sameLine(line, one)) {
        kept.add(line);
      }
    }
    kept.add(one);
    String text = JSON.serialize(kept);
    Integer room = Schedule__c.AcceptedLines__c.getDescribe().getLength();
    while (kept.size() > MOST_LINES || text.length() > room) {
      kept.remove(0);
      text = JSON.serialize(kept);
    }
    return text;
  }

  /** The same line: by what makes it the same when it has that, else by its key. */
  private static Boolean sameLine(
    Map<String, Object> a,
    Map<String, Object> b
  ) {
    Object same = b.get('s');
    return same != null
      ? same.equals(a.get('s'))
      : b.get('k').equals(a.get('k'));
  }

  /** One line the screen sends, or null when it is not one the week can keep. */
  @TestVisible
  private static Map<String, Object> oneLine(String text) {
    if (String.isBlank(text) || text.length() > LONGEST_LINE) {
      return null;
    }
    Map<String, Object> line;
    try {
      line = lineOf(JSON.deserializeUntyped(text));
    } catch (JSONException e) {
      return null;
    }
    if (
      line == null ||
      String.isBlank((String) line.get('k')) ||
      (line.get('n') != null &&
      (Integer) line.get('n') < 0)
    ) {
      return null;
    }
    return line;
  }

  /** The stored lines of the right shape; anything else is left out. */
  @TestVisible
  private static List<Map<String, Object>> linesOf(String text) {
    List<Map<String, Object>> lines = new List<Map<String, Object>>();
    Object parsed = null;
    try {
      parsed = String.isBlank(text) ? null : JSON.deserializeUntyped(text);
    } catch (JSONException e) {
      parsed = null;
    }
    if (!(parsed instanceof List<Object>)) {
      return lines;
    }
    for (Object row : (List<Object>) parsed) {
      Map<String, Object> line = lineOf(row);
      if (line != null) {
        lines.add(line);
      }
    }
    return lines;
  }

  /** { k: text, s: text or null, n: whole number or null }, or null for any other shape. */
  private static Map<String, Object> lineOf(Object row) {
    if (!(row instanceof Map<String, Object>)) {
      return null;
    }
    Map<String, Object> line = (Map<String, Object>) row;
    Object k = line.get('k');
    Object s = line.get('s');
    Object n = line.get('n');
    Boolean shaped =
      k instanceof String &&
      (s == null || s instanceof String) &&
      (n == null || n instanceof Integer);
    return shaped
      ? new Map<String, Object>{ 'k' => k, 's' => s, 'n' => n }
      : null;
  }
}
