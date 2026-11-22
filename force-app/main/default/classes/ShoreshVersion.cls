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
      if (!isInstalled()) {
        return null;
      }
      shown = System.requestVersion();
    }
    return shown == null ? null : shown.major() + '.' + shown.minor();
  }

  /**
   * Whether Shoresh runs as an installed package. Outside one, System.requestVersion() stops the
   * request with an error no catch can stop, so it is never asked there.
   */
  private static Boolean isInstalled() {
    String namespace = ShoreshSchema.namespace();
    if (namespace == null) {
      return false;
    }
    try {
      UserInfo.isCurrentUserLicensed(namespace);
      return true;
    } catch (TypeException notInstalled) {
      // The namespace is this org's own code, not a package installed in it.
      return false;
    }
  }
}
