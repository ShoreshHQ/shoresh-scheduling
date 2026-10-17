/**
 * Turns anything that went wrong into a plain message the scheduler sees on screen. Shoresh's own
 * messages (ShoreshException, trigger and validation messages) are shown as they are; the
 * platform's own wording never is: it names objects and fields. Unknown problems get a short
 * "try again", and the detail goes to the debug log for an admin.
 */
public with sharing class ScreenErrors {
  private static final String COULD_NOT_SAVE = 'Couldn\'t save. Try again.';
  private static final String COULD_NOT_OPEN = 'Couldn\'t open this. Try again.';
  private static final Set<StatusCode> NO_ACCESS = new Set<StatusCode>{
    StatusCode.INSUFFICIENT_ACCESS_OR_READONLY,
    StatusCode.INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY
  };
  // Shoresh's own words: trigger checks (addError) and validation rules.
  private static final Set<StatusCode> OWN_MESSAGE = new Set<StatusCode>{
    StatusCode.FIELD_CUSTOM_VALIDATION_EXCEPTION
  };

  /** For a save or delete that went wrong. */
  public static AuraHandledException of(Exception e) {
    return of(messageFor(e, COULD_NOT_SAVE));
  }

  /** For a screen that could not load what it shows. */
  public static AuraHandledException ofLoading(Exception e) {
    return of(messageFor(e, COULD_NOT_OPEN));
  }

  public static AuraHandledException of(String message) {
    AuraHandledException e = new AuraHandledException(message);
    e.setMessage(message);
    return e;
  }

  private static String messageFor(Exception e, String fallback) {
    if (e instanceof AuraHandledException || e instanceof ShoreshException) {
      return e.getMessage();
    }
    if (e instanceof UserModeWrites.SaveException) {
      UserModeWrites.SaveException failed = (UserModeWrites.SaveException) e;
      return withName(failed.recordName, dmlMessage(failed.failure, fallback));
    }
    if (e instanceof DmlException) {
      return dmlMessage((DmlException) e, fallback);
    }
    logged(e);
    return fallback;
  }

  /** '"Archery": Must be 1 or more.' unless the message already names the row. */
  private static String withName(String name, String message) {
    if (String.isBlank(name) || message.contains('"' + name + '"')) {
      return message;
    }
    return '"' + name + '": ' + message;
  }

  private static String dmlMessage(DmlException e, String fallback) {
    StatusCode code = e.getDmlType(0);
    if (OWN_MESSAGE.contains(code)) {
      return e.getDmlMessage(0);
    }
    if (code == StatusCode.DELETE_FAILED) {
      return 'This can\'t be deleted while something else still uses it. Change that first.';
    }
    if (NO_ACCESS.contains(code)) {
      return 'You don\'t have access to change this. Ask the person who set it up, or a Salesforce admin.';
    }
    if (code == StatusCode.DUPLICATE_VALUE) {
      return 'That name is already used. Pick another.';
    }
    if (code == StatusCode.REQUIRED_FIELD_MISSING) {
      return 'Something required is blank. Fill it in and save again.';
    }
    if (code == StatusCode.STRING_TOO_LONG) {
      return 'Something typed is too long. Shorten it and save again.';
    }
    logged(e);
    return fallback;
  }

  private static void logged(Exception e) {
    System.debug(
      LoggingLevel.ERROR,
      'Shoresh: ' + e.getTypeName() + ': ' + e.getMessage()
    );
  }
}
