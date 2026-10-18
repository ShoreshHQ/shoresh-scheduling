/**
 * What a row save sends with its row (week ticks and who it covers) must be about that row only:
 * a saved row by its Id, a new row as row 0. Anything else is refused before anything is read or
 * written, so a row save can never change another row past its compare and set (RowSaves).
 */
public with sharing class RowExtras {
  private static final String REFUSED = 'These screens can\'t save that.';

  public static void refuseOtherRows(
    SObject record,
    ScreenSaves.Extras extras
  ) {
    if (extras == null) {
      return;
    }
    for (
      RunsIn.WeekOff off : extras.weeksOff == null
        ? new List<RunsIn.WeekOff>()
        : extras.weeksOff
    ) {
      refuseUnless(isThisRow(record, off.target, off.row));
    }
    for (
      SetTimeWho.Who entry : extras.who == null
        ? new List<SetTimeWho.Who>()
        : extras.who
    ) {
      refuseUnless(isThisRow(record, entry.target, entry.row));
    }
    refuseUnless(marksAreThisRows(record, extras.weeksBackOn));
  }

  /** Who the director asked this row to cover; null when the row's who isn't being changed. */
  public static List<Id> wantedWho(ScreenSaves.Extras extras) {
    if (extras == null || extras.who == null || extras.who.isEmpty()) {
      return null;
    }
    List<Id> targets = extras.who[0].targets;
    return targets == null ? new List<Id>() : targets;
  }

  private static Boolean isThisRow(SObject record, Id target, Integer row) {
    return record.Id == null
      ? target == null && row == 0
      : target == record.Id && row == null;
  }

  /** Weeks ticked again: week exceptions of this row (a new row has none). */
  private static Boolean marksAreThisRows(SObject record, List<Id> markIds) {
    if (markIds == null || markIds.isEmpty()) {
      return true;
    }
    if (record.Id == null) {
      return false;
    }
    for (WeekException__c mark : [
      SELECT
        Group__c,
        Activity__c,
        Location__c,
        FixedActivity__c,
        RecurringActivity__c
      FROM WeekException__c
      WHERE Id IN :markIds
      WITH USER_MODE
    ]) {
      Set<Id> targets = new Set<Id>{
        mark.Group__c,
        mark.Activity__c,
        mark.Location__c,
        mark.FixedActivity__c,
        mark.RecurringActivity__c
      };
      if (!targets.contains(record.Id)) {
        return false;
      }
    }
    return true;
  }

  private static void refuseUnless(Boolean ok) {
    if (!ok) {
      throw ScreenErrors.of(REFUSED);
    }
  }
}
