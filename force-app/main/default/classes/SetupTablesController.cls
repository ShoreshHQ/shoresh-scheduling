/**
 * Server side of the setup screens' tables, saved as you go (ADR 0011). Every query runs in
 * user mode and every write uses user-mode DML, so Salesforce enforces the scheduler's object,
 * field, and record access.
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
}
