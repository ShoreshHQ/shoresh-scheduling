/** Turns anything that went wrong into a plain message the scheduler sees on screen. */
public with sharing class ScreenErrors {
  private static final Set<StatusCode> NO_ACCESS = new Set<StatusCode>{
    StatusCode.INSUFFICIENT_ACCESS_OR_READONLY,
    StatusCode.INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY
  };

  public static AuraHandledException of(Exception e) {
    if (e instanceof UserModeWrites.SaveException) {
      UserModeWrites.SaveException failed = (UserModeWrites.SaveException) e;
      return of(withName(failed.recordName, dmlMessage(failed.failure)));
    }
    return of(
      e instanceof DmlException ? dmlMessage((DmlException) e) : e.getMessage()
    );
  }

  /** '"Archery": Must be 1 or more.' unless the message already names the row. */
  private static String withName(String name, String message) {
    if (String.isBlank(name) || message.contains('"' + name + '"')) {
      return message;
    }
    return '"' + name + '": ' + message;
  }

  public static AuraHandledException of(String message) {
    AuraHandledException e = new AuraHandledException(message);
    e.setMessage(message);
    return e;
  }

  private static String dmlMessage(DmlException e) {
    StatusCode code = e.getDmlType(0);
    if (code == StatusCode.DELETE_FAILED) {
      return 'This can\'t be deleted while other records still use it. Change those first. (' +
        e.getDmlMessage(0) +
        ')';
    }
    if (NO_ACCESS.contains(code)) {
      return 'You don\'t have permission to change this. Ask the person who set it up, or a Salesforce admin.';
    }
    return e.getDmlMessage(0);
  }
}
