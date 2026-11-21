/**
 * CORE-6.16: the version of Shoresh installed in this org, as Help in Settings shows it
 * ("Version 1.4"), so a director can tell support which one they have.
 */
public with sharing class ShoreshVersion {
  // A test sets it, since a test never runs inside an installed package.
  @TestVisible
  private static Version installed;

  /** "1.4", or null outside an installed package (a developer's or the test org). */
  @AuraEnabled(cacheable=true)
  public static String installedVersion() {
    Version shown = installed;
    if (shown == null) {
      try {
        shown = System.requestVersion();
      } catch (Exception e) {
        // Not in an installed package: Salesforce has no version to give.
        return null;
      }
    }
    return shown == null ? null : shown.major() + '.' + shown.minor();
  }
}
