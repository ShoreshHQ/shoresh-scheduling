/**
 * Server side of Manual Build's "setup changed since the week started" (ADR 0008 part 6;
 * SetupMatch): what setup changed, as a dot for each cell that differs and the changes "Update
 * to match setup" would make, and making the ones the director chose. Its own requests, so
 * opening a week costs no more than it did. Every query runs in user mode and every write uses
 * user-mode DML.
 */
public with sharing class SetupMatchController {
  /** What setup changed since the Manual Build draft's week started. */
  @AuraEnabled
  public static SetupMatch.Preview getSetupChanges(Id scheduleId) {
    try {
      return SetupMatch.of(scheduleId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /**
   * "Update to match setup": the chosen changes (keys from getSetupChanges, worked out on the
   * week at seenRevisions) are made, and the draft is sent back as it is now. Refused, with
   * nothing changed, when someone saved the week since, or setup changed so a chosen change is
   * no longer the one shown.
   */
  @AuraEnabled
  public static SetupMatch.Updated updateToMatchSetup(
    Id scheduleId,
    List<String> keys,
    String seenRevisions
  ) {
    try {
      return SetupMatch.make(scheduleId, keys, seenRevisions);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
