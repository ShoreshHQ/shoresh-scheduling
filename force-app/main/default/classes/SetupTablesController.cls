/**
 * Server side of the setup screens' tables, saved as you go (ADR 0011), and what their deletes
 * and "Same location?" need (ADR 0012). Every query runs in user mode and every write uses
 * user-mode DML, so Salesforce enforces the scheduler's object, field, and record access.
 */
public with sharing class SetupTablesController {
  /**
   * Saves one table row as the director leaves it, with its week ticks and who it covers, unless
   * someone else changed what the director changed (RowSaves).
   */
  @AuraEnabled
  public static RowSaves.Result saveRow(
    SObject record,
    SObject seen,
    ScreenSaves.Extras extras
  ) {
    return RowSaves.save(record, seen, extras);
  }

  /** How many schedules a bunk or activity is in (0 for anything else), asked before a delete. */
  @AuraEnabled
  public static Integer scheduleUses(Id recordId) {
    try {
      return ScheduleUses.count(recordId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** "Same location?": keeps one place, moves everything at the others to it, deletes them. */
  @AuraEnabled
  public static void mergeLocations(
    Id keepId,
    List<Id> otherIds,
    Decimal groupsThatFit
  ) {
    try {
      LocationMerge.mergeInto(keepId, otherIds, groupsThatFit);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
