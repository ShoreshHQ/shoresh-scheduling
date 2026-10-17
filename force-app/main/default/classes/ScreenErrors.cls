/**
 * Turns anything that went wrong into a plain message the scheduler sees on screen. Shoresh's own
 * messages (ShoreshException, trigger and validation messages) are shown as they are; the
 * platform's own wording never is: it names objects and fields. Unknown problems get a short
 * "try again", and the detail goes to the debug log (once packaged, readable only through
 * subscriber support login, not by the camp's own admin).
 */
public with sharing class ScreenErrors {
  private static final String COULD_NOT_SAVE = 'Couldn\'t save. Try again.';
  private static final String COULD_NOT_OPEN = 'Couldn\'t open this. Try again.';
  // Plain words for the platform's refusals that are not Shoresh's own.
  private static final Map<StatusCode, String> PLAIN = new Map<StatusCode, String>{
    StatusCode.DELETE_FAILED => 'This can\'t be deleted while something else still uses it. Change that first.',
    StatusCode.INSUFFICIENT_ACCESS_OR_READONLY => 'You don\'t have access to change this. Ask the person who set it up, or a Salesforce admin.',
    StatusCode.INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY => 'You don\'t have access to change this. Ask the person who set it up, or a Salesforce admin.',
    StatusCode.INVALID_FIELD_FOR_INSERT_UPDATE => 'You don\'t have access to change that.',
    StatusCode.ENTITY_IS_DELETED => 'That was removed. Reload the page.',
    StatusCode.REQUIRED_FIELD_MISSING => 'Something required is blank. Fill it in and save again.',
    StatusCode.STRING_TOO_LONG => 'Something typed is too long. Shorten it and save again.'
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
      return withName(
        failed.recordName,
        dmlMessage(failed.failure, failed.record, fallback)
      );
    }
    if (e instanceof DmlException) {
      return dmlMessage((DmlException) e, null, fallback);
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

  private static String dmlMessage(
    DmlException e,
    SObject record,
    String fallback
  ) {
    StatusCode code = e.getDmlType(0);
    // Shoresh's own words: trigger checks (addError) and validation rules.
    if (code == StatusCode.FIELD_CUSTOM_VALIDATION_EXCEPTION) {
      return e.getDmlMessage(0);
    }
    if (code == StatusCode.DUPLICATE_VALUE) {
      return duplicateMessage(record);
    }
    if (PLAIN.containsKey(code)) {
      return PLAIN.get(code);
    }
    logged(e);
    return fallback;
  }

  /** Shoresh's own checks catch duplicates first; this is for two saves at the same moment. */
  private static String duplicateMessage(SObject record) {
    Schema.SObjectType kind = record == null ? null : record.getSObjectType();
    if (kind == Week__c.SObjectType) {
      return 'A ' +
        ScreenErrorWords.forWeek((Week__c) record).singularInSentence('Week') +
        ' already starts on that date.';
    }
    if (kind == CampLabel__c.SObjectType) {
      return 'That word is already set.';
    }
    if (kind == ImportAnswer__c.SObjectType) {
      return 'Someone else saved at the same time. Try again.';
    }
    return 'That name is already used. Pick another.';
  }

  private static void logged(Exception e) {
    System.debug(
      LoggingLevel.ERROR,
      'Shoresh: ' + e.getTypeName() + ': ' + e.getMessage()
    );
  }
}
