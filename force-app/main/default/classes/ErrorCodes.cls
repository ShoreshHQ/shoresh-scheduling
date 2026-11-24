/**
 * CORE-6.15: when something goes wrong that Shoresh can't explain in its own words, the person
 * is shown a short support code ("For support: K7Q-4MZ.") to read out or copy, and the same code
 * is kept with the detail as an Error Log record in the camp's own org, where an admin, or Shoresh
 * support logged in as one, finds it by the code. No outside service: the detail never leaves the
 * org.
 *
 * The detail goes out on an event published immediately (ErrorLogEvent__e), so it is kept even
 * though the request that went wrong is undone; the event's trigger writes the record.
 */
public with sharing class ErrorCodes {
  // Letters and digits that can't be heard or read as another (no 0/O, 1/I/L, 2/Z, 5/S, 8/B).
  private static final String LETTERS = 'ACDEFGHJKMNPQRTUVWXY34679';
  private static final Pattern SHAPE = Pattern.compile(
    '[' + LETTERS + ']{3}-[' + LETTERS + ']{3}'
  );
  private static final Integer MOST = 32768;
  // One code per request: a save that fails on many rows names one problem, not many.
  @TestVisible
  private static String thisRequest;

  /**
   * The words with the support code after them; the detail is kept under the code. The first
   * problem in a request is the one kept; later ones in the same request share its code.
   */
  public static String said(String words, String detail) {
    return words + ' For support: ' + keep(detail) + '.';
  }

  /**
   * The detail kept under this request's code, with nothing to say (a problem the person is told
   * about another way). Returns the code.
   */
  public static String keep(String detail) {
    if (thisRequest == null) {
      thisRequest = newCode();
      kept(thisRequest, detail);
    } else {
      System.debug(
        LoggingLevel.ERROR,
        'Shoresh ' + thisRequest + ': ' + detail
      );
    }
    return thisRequest;
  }

  /** What went wrong, for support: the kind, the message and where. */
  public static String detailOf(Exception e) {
    return e.getTypeName() +
      ': ' +
      e.getMessage() +
      '\n' +
      e.getStackTraceString();
  }

  /**
   * A problem a screen met on its own (Salesforce's limits, a dropped connection, a script
   * error): the screen made the code it shows, and keeps it here with what it knows.
   */
  @AuraEnabled
  public static void keepFromScreen(String code, String detail) {
    if (String.isBlank(code) || !SHAPE.matcher(code).matches()) {
      return;
    }
    kept(code, 'From the screen: ' + (detail == null ? '' : detail));
  }

  /**
   * The event's trigger: one Error Log record per code. A code already kept is not kept again,
   * so a screen sending a code a second time (or someone sending another person's) adds nothing.
   */
  public static void write(List<ErrorLogEvent__e> events) {
    Set<String> codes = new Set<String>();
    for (ErrorLogEvent__e event : events) {
      codes.add(event.Code__c);
    }
    // System mode: the trigger runs as Salesforce's Automated Process user, and the log is
    // granted to no one (reviewer notes, system mode row 3). People can add to it only through
    // keepFromScreen, never read, change or delete it; Person__c is who really sent it.
    for (ErrorLog__c kept : [
      SELECT Name
      FROM ErrorLog__c
      WHERE Name IN :codes
      WITH SYSTEM_MODE
    ]) {
      codes.remove(kept.Name);
    }
    List<ErrorLog__c> logs = new List<ErrorLog__c>();
    for (ErrorLogEvent__e event : events) {
      if (codes.remove(event.Code__c)) {
        logs.add(
          new ErrorLog__c(
            Name = event.Code__c,
            Detail__c = event.Detail__c,
            Person__c = event.CreatedById
          )
        );
      }
    }
    Database.insert(logs, false, AccessLevel.SYSTEM_MODE);
  }

  private static String newCode() {
    String code = '';
    for (Integer i = 0; i < 6; i++) {
      Integer at = Math.mod(Crypto.getRandomInteger(), LETTERS.length());
      at = at < 0 ? at + LETTERS.length() : at;
      code += (i == 3 ? '-' : '') + LETTERS.substring(at, at + 1);
    }
    return code;
  }

  private static void kept(String code, String detail) {
    System.debug(LoggingLevel.ERROR, 'Shoresh ' + code + ': ' + detail);
    // A request that can't publish (its limit used up) still shows the code; the detail is then
    // only in the debug log.
    if (
      Limits.getPublishImmediateDml() >= Limits.getLimitPublishImmediateDml()
    ) {
      return;
    }
    EventBus.publish(
      new ErrorLogEvent__e(
        Code__c = code,
        Detail__c = detail == null ? null : detail.left(MOST)
      )
    );
  }
}
