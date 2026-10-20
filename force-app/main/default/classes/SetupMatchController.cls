/**
 * Server side of "setup changed since the week started" on Manual Build and Generated Schedule
 * (ADR 0008 part 6, ADR 0010 §56; SetupMatch): what setup changed, as a dot for each cell that
 * differs and the changes "Update to match setup" would make, and making the ones the director
 * chose. Its own requests, so
 * opening a week costs no more than it did. Every query runs in user mode and every write uses
 * user-mode DML.
 */
public with sharing class SetupMatchController {
  /** What setup changed since the draft's week started (Manual Build's or Generated Schedule's). */
  @AuraEnabled
  public static SetupMatch.Preview getSetupChanges(Id scheduleId) {
    try {
      return SetupMatch.of(scheduleId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /**
   * "Update to match setup": the chosen changes (ask.keys from getSetupChanges, worked out on the
   * week at ask.seenRevisions) are made, and Manual Build's draft is sent back as it is now
   * (Generated Schedule reads its week again). Refused, with
   * nothing changed, when someone saved the week since, or setup changed so a chosen change is
   * no longer the one shown. ask.versionKept: an earlier update in this opening of the list
   * already kept the week as it was, so this one keeps none.
   */
  @AuraEnabled
  public static SetupMatch.Updated updateToMatchSetup(
    Id scheduleId,
    SetupMatch.Ask ask
  ) {
    try {
      return SetupMatch.make(scheduleId, ask);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
